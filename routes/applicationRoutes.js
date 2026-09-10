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
    // US Visa
    { name: "previous_visa_docs", maxCount: 20 },
  ]),
  controller.createApplication
);

router.get('/', auth, controller.getApplications);
router.get('/:id', auth, controller.getApplicationById);

router.put(
  "/:id",
  auth,
  upload.fields([
    { name: "passport_docs", maxCount: 20 },
    { name: "id_documents", maxCount: 20 },
    { name: "visa_copy", maxCount: 20 },
    { name: "previous_visa_docs", maxCount: 20 },
  ]),
  controller.updateApplication
);

router.delete(
  "/:id",
  auth,
  controller.deleteApplication
);

module.exports = router;