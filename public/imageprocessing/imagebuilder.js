const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const readdirAsync = promisify(fs.readdir);

eval(fs.readFileSync("./public/tournament/tournamentutils.js") + "");

var request = require("request"),
  http = require("http"),
  https = require("https");

async function GetYtThumb(urls) {
  var formattedUrls = [];
  urls.forEach((url) => {
    var ytVideoId = extractYoutubeVideoID(url);
  
    //let thumb = "https://i1.ytimg.com/vi/" + ytVideoId + "/maxresdefault.jpg";
      let thumb =
      ytVideoId == "zero"
        ? "https://cdn.glitch.global/3f656222-6918-4bd9-9371-baaf3a2a9010/Domo%20Smarty%20pants%20face.png?v=1691064432062"
        : "https://i1.ytimg.com/vi/" + ytVideoId + "/mqdefault.jpg";

    formattedUrls.push([thumb, ytVideoId]);
  });
  //Example of usage:
  console.log(formattedUrls);
  return formattedUrls;
}

async function downloadImages(urls, singleImage = false) {
  return new Promise(async (resolve) => {
    if (urls.length < 1) {
      resolve();
    } else {
      youtubeImages = await GetYtThumb(urls);
      //  "https://youtu.be/49mVLN8OJSo",
      //  "https://youtu.be/uRbDCEJ23WI",
      //  "https://youtu.be/-AOW64B2bnY",
      //]);

      let inputPath = "/app/public/commands/gif/input/";
      let endImgPath = "/app/public/commands/gif/jpg/";
      console.log(inputPath);

      if (!singleImage) {
        readdirAsync(inputPath, (err, files) => {
          if (err) throw err;

          for (const file of files) {
            fs.unlink(path.join(inputPath, file), (err) => {
              if (err) throw err;
            });
          }
        });
      }

      youtubeImages.forEach(function (image) {
        //console.log("HERE: " + image);
        var fileExists = fileExistsWithoutExtension(inputPath, image[1]);

        if (fileExists) {
          if (singleImage == false) {
            copyFileWithoutExtension(endImgPath, image[1], inputPath);
          }
        } else {
          var path = singleImage !== false ? endImgPath : inputPath;
          downloadImage(image[0], path + image[1] + ".jpg");
        }
      });

      resolve();
    }
  });
}

async function downloadImage(uri, filename, callback) {
  var client = http;
  if (uri.toString().indexOf("https") === 0) {
    client = https;
  }

  client
    .request(uri, function (response) {
      var data = new Stream();

      response.on("data", function (chunk) {
        data.push(chunk);
      });

      response.on("end", function () {
        writeFileSync(filename, data.read());
      });
    })
    .end();
  console.log("File downloaded");
}

function fileExistsWithoutExtension(folderPath, fileName) {
  fs.readdir(folderPath, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return;
    }

    const fileFound = files.some((file) => {
      const fileNameWithoutExt = path.parse(file).name;
      return fileNameWithoutExt === fileName;
    });

    if (fileFound) {
      return true;
    } else {
      return false;
    }
  });
}

function copyFileWithoutExtension(folderPath, fileName, targetFolderPath) {
  fs.readdir(folderPath, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return;
    }

    files.forEach((file) => {
      const fileNameWithoutExt = path.parse(file).name;

      if (fileNameWithoutExt === fileName) {
        const sourceFilePath = path.join(folderPath, file);
        const targetFilePath = path.join(targetFolderPath, file);

        fs.copyFile(sourceFilePath, targetFilePath, (err) => {
          if (err) {
            console.error(`Error copying file: ${file}`, err);
          } else {
            console.log(`Copied file: ${file}`);
          }
        });
      }
    });
  });
}
