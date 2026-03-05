const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const controller = require("../controllers/appilicationController");

router.post(
  "/",
  auth,
  upload.fields([
    { name: "passport_docs" },
    { name: "id_documents" },
    { name: "visa_copy" },
  ]),
  controller.createApplication
);

router.get('/', auth, controller.getApplications);
router.get('/:id', auth, controller.getApplicationById);

module.exports = router;