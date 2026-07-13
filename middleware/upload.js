const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const newName =
      Date.now() + "_" +
      Math.floor(Math.random() * 10000) +
      "_" + file.originalname;
    cb(null, newName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["pdf", "jpg", "jpeg", "png"];
  const ext = path.extname(file.originalname).substring(1).toLowerCase();

  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error("Invalid file type"), false);
};

module.exports = multer({ storage, fileFilter });