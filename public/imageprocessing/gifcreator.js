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
let imagesFolder = "public/commands/gif/input/";
let imagesOutputFolder = "public/commands/gif/jpg/";

let dstPath = "public/commands/gif/output";

async function createGif(algorithm, gifName, fileList = null, delay = 2000, repeat = 0) {
  return new Promise(async (resolve) => {
    try {
      const dstPath = path.join(
        "public/commands/gif/output/",
        gifName + ".gif"
      );
      
      let files = fileList;
      if (!files) {
        const rawFiles = await readdirAsync(imagesFolder);
        files = rawFiles.map(f => path.join(imagesFolder, f));
      }
      
      console.log("Files for GIF:", files);

      if (files.length === 0) {
        throw new Error("No files provided for GIF creation.");
      }

      const firstFile = files[0];
      console.log("First file path:", firstFile);

      if (!existsSync(firstFile)) {
        throw new Error(`The file ${firstFile} does not exist.`);
      }

      // find the width and height of the image
      const [width, height] = await new Promise((resolve2) => {
        const image = new Image();
        image.onload = () => resolve2([image.width, image.height]);
        image.onerror = (err) => {
          console.error("Error loading image:", err);
          resolve2([undefined, undefined]);
        };
        image.src = firstFile;
      });

      if (!width || !height) {
        throw new Error("Image dimensions could not be determined.");
      }

      const writeStream = createWriteStream(dstPath);
      writeStream.on("close", () => {
        resolve();
      });

      const encoder = new GIFEncoder(width, height, algorithm, true);
      encoder.createReadStream().pipe(writeStream);
      encoder.start();
      encoder.setDelay(delay);
      encoder.setRepeat(repeat);

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      for (const file of files) {
        await new Promise((resolve3) => {
          const image = new Image();
          image.onload = () => {
            ctx.clearRect(0, 0, width, height); // Clear canvas to prevent ghosting
            ctx.drawImage(image, 0, 0);
            encoder.addFrame(ctx);
            resolve3();
          };
          image.onerror = (err) => {
            console.error(`Error loading image ${file}:`, err);
            resolve3();
          };
          image.src = file;
          console.log(`Processing file: ${image.src}`);
        });
      }

      encoder.finish();
      console.log("gif created:", dstPath);
      resolve();
    } catch (error) {
      console.error("An error occurred during GIF creation:", error);
      resolve();
    }
  });
}

module.exports = {
    createGif
};
