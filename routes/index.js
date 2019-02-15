var express = require("express"),
    azure = require("azure-storage"),
    router = express.Router(),
    http = require("http"),
    request = require("request"),
    fs = require("fs"),
    unzip = require("unzip"),
    shell = require("shelljs"),
    obj2gltf = require("obj2gltf"),
    path = require("path"),
    exec = require("child_process").exec,
    location = null,
    code,
    fileFormat,
    name,
    parts,
    fullname,
    dirs,
    containerDymic,
    extOutput,
    extOutObj,
    extOutputZip;

/* GET home page. */
router.get("/", function(req, res, next) {
    res.end("Path: e.g http://localhost:3000/convert?url=full path of obj file either  in .zip or .obj");
});

router.get("/convert", function(req, res) {
    location = req.query.url;
    fullname = location.split("/");
    filename = fullname[fullname.length - 1];
    parts = filename.split(".");
    name = parts[0];
    containerDymic = location.split("/");

    // start process
    function startProcess(callback) {
        extOutput = "./public/convertor_dir/" + containerDymic[4];
        extOutObj = "./public/convertor_dir/" + containerDymic[4] + "/" + filename; //directory path + name of obj file
        extOutputZip = "./public/convertor_dir/" + name;

        if (location.toLowerCase().indexOf(".obj") > 0) {
            fileFormat = 0;
            dirs = extOutput;
        } else if (location.toLowerCase().indexOf(".zip") > 0) {
            fileFormat = 1;
            dirs = extOutputZip;
        } else {
            console.log("Note: Requested file can't be converted to glb");
            res.end("Note: Requested file can't be converted to glb please provide the valid obj or zip (containing obj) file");
        }
        shell.mkdir("-p", dirs);
        callback();
    }
    //if it is .zip then it will be extracted in the new created directory
    function download(location, callback) {
        if (fileFormat === 0) {
            request.head(location, function(err, res, body) {
                var r = request(location).pipe(fs.createWriteStream(extOutObj))
                    .on("error", error)
                    .on('close', function() {
                        console.log("fully download")
                        callback(body);
                    })

            });
        }

        if (fileFormat === 1) {
            request.head(location, function(err, res, newbody) {
                //extraction on request
                var r = request(location).pipe(
                    unzip.Extract({
                        path: dirs
                    })
                    .on('error', error)
                    .on('close', function() {
                        console.log("fully extracted")
                        callback(err, res, newbody);
                    })
                );

            });
        }
    }
    // looking for objs to convert
    function getObjs(dirs, callback) {
        var fileType = ".obj";
        var files = "";
        fs.readdir(dirs, "utf8", function(err, list) {
            for (i = 0; i < list.length; i++) {
                if (path.extname(list[i]) === fileType) {
                    files = list[i]; //store the file name into the array files
                    console.log(files, "file is found");
                } else {
                    files = undefined;
                }
            }
            if (files === undefined) {
                res.end('Sorry obj file does not exist try another file')
                var ch = dirs;
                shell.rm("-rf", ch);
                console.log("Directory is being deleted :", ch);
            } else {
                var renameGlb = files.split(".");
                var glbName = renameGlb[0];
                var outPaths = dirs + "/" + glbName;
                // conversion shell script
                code = "obj2gltf  -i " + dirs + "/" + files + " -o " + outPaths + ".glb";
                exec(code, function(err, stdout, stder) {
                    callback(err);
                }); // calling shell script to execute
            }
        });

    }

    //uploading converted file and removing directories from local
    function upload2AzureDlt(dirs, callback) {
        var storageAccount = "twportal";
        var accessKey =
            "enter your access key";
        var blobSvc = azure.createBlobService(storageAccount, accessKey);
        var glbfiles = "",
            fileTypes = ".glb",
            container = [],
            blobName,
            doneGlb = false,
            URLtoAzure,
            i;

        fs.readdir(dirs, "utf8", function(err, list) {
            if (err) {
                res.end("Unexpected Error");
            }

            for (i = 0; i < list.length; i++) {
                if (path.extname(list[i]) === fileTypes) {
                    glbfiles = list[i]; //store the file name into the array files
                }
            }
            var renameGlb = glbfiles.split(".");
            var glbName = renameGlb[0];
            container = containerDymic[3]; // fetch container name from url index

            if (fileFormat === 0) {
                blobName = containerDymic[4] + "/" + glbName + ".glb";
            }
            if (fileFormat === 1) {
                blobName = name + "/" + glbName + ".glb";
            }

            URLtoAzure = path.resolve(dirs + "/" + glbfiles); //file path
            blobSvc.createBlockBlobFromLocalFile(container, blobName, URLtoAzure,
                function(err, result, response) {
                    if (err) {
                        res.end("Unexpected Error");
                    } else {
                        console.log("Uploaded to Azure");
                        var ch = dirs;
                        shell.rm("-rf", ch);
                        console.log("Directory has been deleted :", ch);
                        doneGlb = true;
                    }
                    res.end("Successfully converted Obj2glb and Uploaded to Azure !");
                    callback(err);
                }
            );
        });
    } // ./upload2AzureDlt func

    startProcess(function(result) {
        download(location, function(result) {
            getObjs(dirs, function(result) {
                upload2AzureDlt(dirs, function(result) {}); // 4
            }); // 3
        }); // 2
    }); //1

    // handle errors
    var error = function(message) {
        console.log(message);
    };
}); // router test ends

module.exports = router;
