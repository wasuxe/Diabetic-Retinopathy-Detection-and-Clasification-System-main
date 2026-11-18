# Diabetic-Retinopathy-Detection-and-Clasification-System

### Abstract
This research paper addresses the critical challenge of diabetic retinopathy (DR), a severe complication of diabetes leading to potential blindness. The proposed methodology leverages transfer learning with convolutional neural networks (CNNs) for automatic DR detection using a single fundus photograph, demonstrating high effectiveness with a quadratic weighted kappa score of 0.92546 in the APTOS 2019 Blindness Detection Competition. The paper reviews existing literature on DR detection, spanning classical computer vision methods to deep learning approaches, particularly focusing on CNNs. It identifies gaps in the research, emphasizing the lack of exploration in integrating pretrained large language models with segmented image inputs for generating recommendations and understanding dynamic interactions within a web application context.Objectives include developing a comprehensive DR detection methodology, exploring model integration, evaluating performance through competition ranking, contributing significantly to DR detection methodologies, and identifying research gaps.The methodology involves data preprocessing, data augmentation, and the use of a U-Net neural network architecture for segmentation. The U-Net model efficiently segments retinal structures, including blood vessels, hard and soft exudates, haemorrhages, microaneurysms, and the optical disc. High evaluation scores in Jaccard, F1, recall, precision, and accuracy underscore the model's potential for enhancing diagnostic capabilities in retinal pathology assessment.The outcomes of this research hold promise for improving patient outcomes through timely diagnosis and intervention in the fight against diabetic retinopathy, marking a significant contribution to the field of medical image analysis.

#### Link to AccScience publication (Catagory: Arteficial Intelligence in Health): https://accscience.com/journal/AIH/articles/online_first/1758

The QWK score cited above is part of the project’s APTOS 2019 competition/research description. It is not a verified performance metric for the classifier currently loaded by the web application.
## Current web application

The web app is in `Classification/` and loads `Classification/model/model.h5`. Run it from that directory with `python app.py` after installing its Python requirements. The screening page accepts JPG, JPEG, and PNG images and preserves the existing `POST /predict` plain-text stage response. Uploaded images are decoded in memory and are not written to the upload folder.

The dashboard keeps screening activity only in the current browser session. It does not include patient records or a database. Reports are print views of the latest session result; the classifier does not return confidence scores, lesion annotations, or clinical observations.

The Segmentation Lab displays saved evaluation composites, each containing an original image, ground-truth mask, and thresholded prediction. Five lesion workstreams have saved composites; no Blood Vessel result composite was found. The six segmentation checkpoints are not included, so the app does not run live segmentation. Saved composites are references and are not linked to uploaded screening images.

This software is a research demonstration, not a medical diagnosis or a substitute for ophthalmologist review.

