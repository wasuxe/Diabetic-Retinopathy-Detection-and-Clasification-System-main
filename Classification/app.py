from io import BytesIO
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file, send_from_directory, url_for
from tensorflow.keras.models import load_model
import numpy as np
import cv2

app = Flask(__name__)
APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

MODEL_PATH = APP_DIR / "model" / "model.h5"
saved_model = load_model(str(MODEL_PATH), compile=False)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
STAGE_LABELS = {
    0: "No DIABETIC RETINOPATHY",
    1: "Mild DIABETIC RETINOPATHY",
    2: "Moderate DIABETIC RETINOPATHY",
    3: "Severe DIABETIC RETINOPATHY",
    4: "Proliferative DIABETIC RETINOPATHY",
}
SEGMENTATION_WORKSTREAMS = {
    "blood-vessels": (
        "Blood vessel segmentation",
        PROJECT_DIR / "Blood Vessel Segmentation" / "UNET" / "results",
    ),
    "haemorrhages": (
        "Haemorrhage segmentation",
        PROJECT_DIR / "Haemorage Segmentation" / "results",
    ),
    "hard-exudates": (
        "Hard exudate segmentation",
        PROJECT_DIR / "Hard Exudate Segmentation" / "results",
    ),
    "soft-exudates": (
        "Soft exudate segmentation",
        PROJECT_DIR / "Soft Exudate Segmentation" / "results",
    ),
    "microaneurysms": (
        "Microaneurysm segmentation",
        PROJECT_DIR / "Microanuerism Segmentation" / "results",
    ),
    "optic-disc": (
        "Optic disc segmentation",
        PROJECT_DIR / "Optical Disc Segmentation" / "results",
    ),
}


@app.get("/")
def index():
    return render_template('index.html')


@app.get("/showcase/fundus")
def showcase_fundus():
    sample_dir = PROJECT_DIR / "sample data"
    return send_from_directory(str(sample_dir), "10_right.jpeg")


@app.get("/api/segmentation-results")
def segmentation_results():
    groups = []
    for slug, (name, results_dir) in SEGMENTATION_WORKSTREAMS.items():
        outputs = []
        if results_dir.is_dir():
            for result_path in sorted(results_dir.glob("*.png")):
                outputs.append(
                    {
                        "id": result_path.stem,
                        "url": url_for(
                            "segmentation_result_image",
                            slug=slug,
                            filename=result_path.name,
                        ),
                        "panels": {
                            panel: url_for(
                                "segmentation_result_image",
                                slug=slug,
                                filename=result_path.name,
                                panel=panel,
                            )
                            for panel in ("original", "mask", "prediction")
                        },
                        "alt": (
                            f"Saved {name.lower()} evaluation composite for "
                            f"{result_path.stem}: original image, ground-truth "
                            "mask, and thresholded prediction."
                        ),
                    }
                )
        groups.append({"id": slug, "name": name, "outputs": outputs})
    return jsonify({"groups": groups})


@app.get("/segmentation-results/<slug>/<filename>")
def segmentation_result_image(slug, filename):
    workstream = SEGMENTATION_WORKSTREAMS.get(slug)
    if workstream is None:
        return "Segmentation workstream not found.", 404
    results_dir = workstream[1]
    if (
        Path(filename).name != filename
        or Path(filename).suffix.lower() != ".png"
        or not results_dir.is_dir()
        or not (results_dir / filename).is_file()
    ):
        return "Segmentation result not found.", 404
    panel = request.args.get("panel")
    if panel is None:
        return send_from_directory(str(results_dir), filename)

    panel_index = {"original": 0, "mask": 1, "prediction": 2}.get(panel)
    if panel_index is None:
        return "Segmentation panel not found.", 400
    image = cv2.imdecode(
        np.frombuffer((results_dir / filename).read_bytes(), dtype=np.uint8),
        cv2.IMREAD_UNCHANGED,
    )
    if image is None:
        return "Saved segmentation result could not be decoded.", 500
    separator_width = 10
    panel_width, remainder = divmod(image.shape[1] - (2 * separator_width), 3)
    if panel_width <= 0 or remainder:
        return "Saved segmentation result has an unexpected layout.", 500
    panel_start = panel_index * (panel_width + separator_width)
    panel_image = image[:, panel_start:panel_start + panel_width]
    encoded, buffer = cv2.imencode(".png", panel_image)
    if not encoded:
        return "Saved segmentation panel could not be encoded.", 500
    return send_file(BytesIO(buffer.tobytes()), mimetype="image/png")


@app.route("/predict", methods=["GET", "POST"])
def predict():
    if request.method == "GET":
        return "Attach a retinal image to run a screening.", 405

    image_file = request.files.get("file")
    if image_file is None or not image_file.filename:
        return "Choose an image before starting the screening.", 400
    if Path(image_file.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        return "Only JPG, JPEG, and PNG images are supported.", 400

    image_bytes = image_file.read()
    if not image_bytes:
        return "The selected image is empty.", 400

    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return "The selected file could not be decoded as an image.", 400

    image = cv2.resize(image, (64, 64))
    model_input = np.reshape(image, (1, 64, 64, 3))
    prediction = saved_model.predict(model_input, verbose=0)
    if prediction.shape != (1, 1) or not np.isfinite(prediction[0, 0]):
        return "The classifier returned an invalid output.", 500

    stage = int(round(float(prediction[0, 0]))) - 2
    result = STAGE_LABELS.get(stage)
    if result is None:
        return "The classifier returned a stage outside its supported range.", 500
    return result

if __name__ == '__main__':
    app.run()
