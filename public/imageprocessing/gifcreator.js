const GIFEncoder = require("gif-encoder-2");
const { createCanvas, Image } = require("canvas");
const path = require("path");
const {
  writeFileSync,
  readFileSync,
  existsSync,
  createReadStream,
  createWriteStream,
  readdir,
  unlink,
  rename,
} = require("fs");
const { promisify } = require("util");

eval(readFileSync("./public/imageprocessing/imagebuilder.js") + "");

var Stream = require("stream").Transform;

const readdirAsync = promisify(readdir);
let imagesFolder = "/app/public/commands/gif/input";
let imagesOutputFolder = "/app/public/commands/gif/jpg/";

let dstPath = "/app/public/commands/gif/output";

console.log(imagesFolder + " + " + dstPath);

async function createGif(algorithm, gifName) {
  return new Promise((resolve) => {
    // Delete Previous Gif
    readdirAsync(dstPath, (err, files) => {
      if (err) throw err;

      //for (const file of files) {
      //  unlink(path.join(dstPath, file), (err) => {
      //    if (err) throw err;
      //  });
      //}
    });

    return new Promise(async (resolve1) => {
      // read image directory
      const files = await readdirAsync(imagesFolder);

      // base GIF filepath on which algorithm is being used
      const dstPath = "/app/public/commands/gif/output/" + gifName + ".gif";
      if (existsSync(dstPath)) {
        console.log("gif already exists");
        resolve();
      } else {
        // find the width and height of the image
        const [width, height] = await new Promise((resolve2) => {
          const image = new Image();
          image.onload = () => resolve2([image.width, image.height]);
          image.src = path.join(imagesFolder, files[0]);
        });

        //const dstPath = path.join(__dirname, "./gif/output/", imagename + `.gif`);
        // create a write stream for GIF data
        const writeStream = createWriteStream(dstPath);
        // when stream closes GIF is created so resolve promise
        writeStream.on("close", () => {
          resolve1();
        });

        const encoder = new GIFEncoder(width, height, algorithm, true);
        // pipe encoder's read stream to our write stream
        encoder.createReadStream().pipe(writeStream);
        encoder.start();
        encoder.setDelay(2000);
        encoder.setRepeat(20);

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        console.log("We have created the canvas");

        // draw an image for each file and add frame to encoder
        for (const file of files) {
          await new Promise((resolve3) => {
            console.log("We got to the promise");
            const image = new Image();
            image.onload = () => {
              ctx.drawImage(image, 0, 0);
              encoder.addFrame(ctx);
              resolve3();
            };
            image.src = path.join(imagesFolder, file);
          });
        }
        encoder.finish();
        console.log("gif created");
        resolve();
      }
    });
  });
}
//createGif('neuquant')

//var encoder = new GIFEncoder();
//encoder.setRepeat(0);
//encoder.setDelay(100);
//encoder.start();
//encoder.addFrame(document.getElementById('img1'));
//encoder.addFrame(document.getElementById('img2'));
//encoder.addFrame(document.getElementById('img3'));
//encoder.finish();
//var binary_gif = encoder.stream().getData();
//var data_url = 'data:image/gif;base64,'+encode64(binary_gif);
