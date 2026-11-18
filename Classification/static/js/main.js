(() => {
    "use strict";

    const views = [...document.querySelectorAll("[data-page]")];
    const navItems = [...document.querySelectorAll("[data-view-target]")];
    const pageTitles = {
        overview: "Overview",
        screening: "New screening",
        patients: "Patient records",
        history: "Analysis history",
        segmentation: "Segmentation lab",
        reports: "Reports",
        model: "About the model"
    };
    const stageColors = {
        "No DR": "#4aa789",
        Mild: "#78a35c",
        Moderate: "#c79642",
        Severe: "#c77a4e",
        "Proliferative DR": "#bd5c66"
    };
    const maxFileSize = 16 * 1024 * 1024;
    const sessionResults = [];
    let selectedFile = null;
    let selectedImageUrl = null;
    let lastResult = null;
    let startedAt = 0;
    let segmentationGroups = [];
    let segmentationLoading = false;

    const byId = (id) => document.getElementById(id);
    const fileInput = byId("imageUpload");
    const dropzone = byId("dropzone");
    const form = byId("screening-form");
    const previewPanel = byId("preview-panel");
    const analysisState = byId("analysis-state");
    const resultSection = byId("result-section");
    const sidebar = byId("sidebar");
    const sidebarBackdrop = byId("sidebar-backdrop");

    function setView(name) {
        if (!Object.prototype.hasOwnProperty.call(pageTitles, name)) return;
        views.forEach((view) => {
            const active = view.dataset.page === name;
            view.hidden = !active;
            view.classList.toggle("is-active", active);
        });
        navItems.forEach((item) => {
            const active = item.dataset.viewTarget === name;
            item.classList.toggle("is-active", active);
            if (active) item.setAttribute("aria-current", "page");
            else item.removeAttribute("aria-current");
        });
        byId("current-view-title").textContent = pageTitles[name];
        closeSidebar();
        if (name === "reports") renderReport();
        if (name === "segmentation" && segmentationGroups.length === 0) loadSegmentationResults();
    }

    document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-view-target]");
        if (!target) return;
        event.preventDefault();
        setView(target.dataset.viewTarget);
    });

    function closeSidebar() {
        sidebar.classList.remove("is-open");
        sidebarBackdrop.classList.remove("is-visible");
        byId("mobile-menu-button").setAttribute("aria-label", "Open navigation");
    }

    byId("mobile-menu-button").addEventListener("click", () => {
        const isOpen = sidebar.classList.toggle("is-open");
        sidebarBackdrop.classList.toggle("is-visible", isOpen);
        byId("mobile-menu-button").setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    });
    sidebarBackdrop.addEventListener("click", closeSidebar);
    window.addEventListener("resize", () => {
        if (window.innerWidth > 760) closeSidebar();
    });

    const notificationsButton = byId("notifications-button");
    const notificationsPopover = byId("notifications-popover");
    notificationsButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = notificationsButton.getAttribute("aria-expanded") !== "true";
        notificationsButton.setAttribute("aria-expanded", String(isOpen));
        notificationsPopover.hidden = !isOpen;
    });
    document.addEventListener("click", (event) => {
        if (event.target.closest(".notification-wrap")) return;
        notificationsButton.setAttribute("aria-expanded", "false");
        notificationsPopover.hidden = true;
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || notificationsPopover.hidden) return;
        notificationsButton.setAttribute("aria-expanded", "false");
        notificationsPopover.hidden = true;
        notificationsButton.focus();
    });

    function showUploadError(message) {
        const error = byId("upload-error");
        error.textContent = message;
        error.hidden = false;
    }

    function clearUploadError() {
        const error = byId("upload-error");
        error.textContent = "";
        error.hidden = true;
    }

    function releaseImageUrl(url) {
        if (url && url !== lastResult?.imageUrl) URL.revokeObjectURL(url);
    }

    function handleFile(file) {
        if (!file) return;
        clearUploadError();
        const extension = file.name.split(".").pop().toLowerCase();
        const allowed = ["jpg", "jpeg", "png"].includes(extension);
        const supportedMime = !file.type || ["image/jpeg", "image/png"].includes(file.type);
        if (!allowed || !supportedMime) {
            showUploadError("Choose a JPG, JPEG, or PNG image.");
            return;
        }
        if (file.size === 0) {
            showUploadError("This file is empty. Choose another image.");
            return;
        }
        if (file.size > maxFileSize) {
            showUploadError("The image is larger than 16 MB. Choose a smaller file.");
            return;
        }

        const oldUrl = selectedImageUrl;
        selectedFile = file;
        selectedImageUrl = URL.createObjectURL(file);
        if (oldUrl !== lastResult?.imageUrl) releaseImageUrl(oldUrl);
        byId("image-preview").src = selectedImageUrl;
        byId("preview-filename").textContent = file.name;
        byId("preview-file-meta").textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB · ${file.type || "Image"}`;
        dropzone.hidden = true;
        previewPanel.hidden = false;
        byId("btn-predict").disabled = false;
        analysisState.hidden = true;
        resultSection.hidden = true;
        document.querySelectorAll(".workflow-step").forEach((step, index) => {
            step.classList.toggle("is-current", index === 0);
        });
    }

    function clearSelectedFile() {
        clearUploadError();
        const oldUrl = selectedImageUrl;
        selectedFile = null;
        selectedImageUrl = null;
        fileInput.value = "";
        byId("image-preview").removeAttribute("src");
        previewPanel.hidden = true;
        dropzone.hidden = false;
        byId("btn-predict").disabled = true;
        if (oldUrl !== lastResult?.imageUrl) releaseImageUrl(oldUrl);
    }

    fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
    byId("browse-files").addEventListener("click", (event) => {
        event.stopPropagation();
        fileInput.click();
    });
    byId("replace-image").addEventListener("click", () => fileInput.click());
    byId("remove-image").addEventListener("click", clearSelectedFile);
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.click();
        }
    });
    ["dragenter", "dragover"].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropzone.classList.add("is-dragging");
        });
    });
    ["dragleave", "drop"].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropzone.classList.remove("is-dragging");
        });
    });
    dropzone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));

    function getStage(response) {
        const normalized = response.trim().toLowerCase();
        if (normalized.includes("proliferative")) return "Proliferative DR";
        if (normalized.includes("no diabetic") || normalized.includes("no dr")) return "No DR";
        if (normalized.includes("mild")) return "Mild";
        if (normalized.includes("moderate")) return "Moderate";
        if (normalized.includes("severe")) return "Severe";
        return null;
    }

    function formatTimestamp(date) {
        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function renderSessionActivity() {
        const count = sessionResults.length;
        byId("session-scan-count").textContent = String(count);
        byId("history-count").textContent = `${count} ${count === 1 ? "result" : "results"}`;

        const overviewEmpty = byId("overview-activity");
        const overviewList = byId("overview-activity-list");
        overviewEmpty.hidden = count > 0;
        overviewList.hidden = count === 0;
        overviewList.replaceChildren();

        sessionResults.slice(-4).reverse().forEach((result) => {
            const row = document.createElement("div");
            row.className = "activity-row";
            row.style.setProperty("--stage-color", stageColors[result.stage]);
            row.innerHTML = `<span class="activity-dot"></span><span><strong></strong><small>Model screening · session only</small></span><time></time>`;
            row.querySelector("strong").textContent = result.stage;
            row.querySelector("time").textContent = result.timeLabel;
            overviewList.append(row);
        });

        const historyEmpty = byId("history-empty");
        const historyWrap = byId("history-table-wrap");
        const tbody = byId("history-table-body");
        historyEmpty.hidden = count > 0;
        historyWrap.hidden = count === 0;
        tbody.replaceChildren();
        sessionResults.slice().reverse().forEach((result) => {
            const row = document.createElement("tr");
            const stage = document.createElement("td");
            stage.innerHTML = `<span class="table-stage"><span></span></span>`;
            stage.querySelector(".table-stage").style.setProperty("--stage-color", stageColors[result.stage]);
            stage.querySelector(".table-stage").append(document.createTextNode(result.stage));
            const idCell = document.createElement("td");
            idCell.textContent = result.id;
            const timeCell = document.createElement("td");
            timeCell.textContent = result.timeLabel;
            const reportCell = document.createElement("td");
            const reportButton = document.createElement("button");
            reportButton.type = "button";
            reportButton.className = "table-report-button";
            reportButton.textContent = result.id === lastResult?.id ? "Open latest report" : "Latest result only";
            reportButton.disabled = result.id !== lastResult?.id;
            if (result.id === lastResult?.id) {
                reportButton.addEventListener("click", () => setView("reports"));
            }
            reportCell.append(reportButton);
            row.append(idCell, stage, timeCell, reportCell);
            tbody.append(row);
        });

        const distributionEmpty = byId("stage-distribution-empty");
        const distributionList = byId("stage-distribution-list");
        distributionEmpty.hidden = count > 0;
        distributionList.hidden = count === 0;
        distributionList.replaceChildren();
        if (count > 0) {
            const stageCounts = new Map();
            sessionResults.forEach((result) => {
                stageCounts.set(result.stage, (stageCounts.get(result.stage) || 0) + 1);
            });
            Object.keys(stageColors).forEach((stage) => {
                const stageCount = stageCounts.get(stage) || 0;
                if (stageCount === 0) return;
                const row = document.createElement("div");
                row.className = "distribution-row";
                row.style.setProperty("--stage-color", stageColors[stage]);
                row.innerHTML = '<span></span><div class="distribution-bar"><span></span></div><strong></strong>';
                row.querySelector("span").textContent = stage;
                row.querySelector(".distribution-bar span").style.width = `${(stageCount / count) * 100}%`;
                row.querySelector("strong").textContent = String(stageCount);
                distributionList.append(row);
            });
        }

        byId("overview-report-empty").hidden = !lastResult;
        byId("overview-report-content").hidden = !lastResult;
        if (lastResult) {
            byId("overview-report-stage").textContent = lastResult.stage;
            byId("overview-report-time").textContent = `${lastResult.id} · ${lastResult.timeLabel}`;
        }
    }

    function renderReport() {
        const hasResult = Boolean(lastResult);
        byId("report-empty").hidden = hasResult;
        byId("report-content").hidden = !hasResult;
        byId("print-report").disabled = !hasResult;
        if (!hasResult) return;
        byId("report-id").textContent = lastResult.id;
        byId("report-date").textContent = lastResult.timeLabel;
        byId("report-image").src = lastResult.imageUrl;
        byId("report-stage").textContent = lastResult.stage;
        byId("report-output").textContent = lastResult.output;
    }

    byId("print-report").addEventListener("click", () => {
        if (lastResult) window.print();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearUploadError();
        if (!selectedFile) {
            showUploadError("Choose a retinal image before starting the screening.");
            return;
        }

        const previousButtonLabel = byId("btn-predict").querySelector(".button-label").textContent;
        byId("btn-predict").disabled = true;
        byId("btn-predict").querySelector(".button-label").textContent = "Analyzing…";
        analysisState.hidden = false;
        byId("analysis-title").textContent = "Uploading retinal image";
        byId("analysis-message").textContent = "Preparing the selected image for the classifier.";
        byId("analysis-progress").value = 0;
        resultSection.hidden = true;
        startedAt = performance.now();
        document.querySelectorAll(".workflow-step").forEach((step, index) => {
            step.classList.toggle("is-current", index === 1);
        });

        try {
            const body = new FormData();
            body.append("file", selectedFile, selectedFile.name);
            const output = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", form.action);
                xhr.upload.addEventListener("progress", (uploadEvent) => {
                    if (!uploadEvent.lengthComputable) return;
                    byId("analysis-progress").value = (uploadEvent.loaded / uploadEvent.total) * 100;
                    byId("analysis-title").textContent = "Uploading retinal image";
                    byId("analysis-message").textContent = `${Math.round((uploadEvent.loaded / uploadEvent.total) * 100)}% uploaded`;
                });
                xhr.upload.addEventListener("load", () => {
                    byId("analysis-title").textContent = "Analyzing retinal image";
                    byId("analysis-message").textContent = "Upload complete. Waiting for the classifier response.";
                });
                xhr.addEventListener("load", () => {
                    const responseText = xhr.responseText.trim();
                    if (xhr.status < 200 || xhr.status >= 300) {
                        reject(new Error(responseText || `Screening failed with status ${xhr.status}.`));
                        return;
                    }
                    resolve(responseText);
                });
                xhr.addEventListener("error", () => reject(new Error("The screening request could not reach the server.")));
                xhr.send(body);
            });
            const stage = getStage(output);
            if (!stage) throw new Error("The classifier returned an unrecognized response. No result was recorded.");

            const previousImageUrl = lastResult?.imageUrl;
            const completedAt = new Date();
            const id = `RI-${completedAt.getTime().toString(36).toUpperCase()}`;
            const elapsedSeconds = Math.max(0, (performance.now() - startedAt) / 1000);
            lastResult = {
                id,
                stage,
                output,
                timeLabel: formatTimestamp(completedAt),
                imageUrl: selectedImageUrl,
                elapsed: elapsedSeconds
            };
            if (previousImageUrl && previousImageUrl !== selectedImageUrl) URL.revokeObjectURL(previousImageUrl);
            sessionResults.push(lastResult);

            byId("result-id").textContent = id;
            byId("result-title").textContent = "Screening complete";
            byId("result-subtitle").textContent = "Model-generated stage estimate";
            byId("stage-name").textContent = stage;
            byId("diagnostic-stage").style.setProperty("--stage-color", stageColors[stage]);
            byId("result-time").textContent = `${elapsedSeconds.toFixed(1)} seconds`;
            byId("result-image").src = selectedImageUrl;
            byId("stage-indicator").style.backgroundColor = stageColors[stage];

            analysisState.hidden = true;
            resultSection.hidden = false;
            document.querySelectorAll(".workflow-step").forEach((step, index) => {
                step.classList.toggle("is-current", index === 2);
            });
            renderSessionActivity();
            resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            analysisState.hidden = true;
            document.querySelectorAll(".workflow-step").forEach((step, index) => {
                step.classList.toggle("is-current", index === 0);
            });
            showUploadError(error.message || "The screening could not be completed. Please try again.");
        } finally {
            byId("btn-predict").querySelector(".button-label").textContent = previousButtonLabel;
            byId("btn-predict").disabled = !selectedFile;
        }
    });

    byId("screen-another").addEventListener("click", () => {
        resultSection.hidden = true;
        selectedFile = null;
        const previousImageUrl = selectedImageUrl;
        selectedImageUrl = null;
        fileInput.value = "";
        previewPanel.hidden = true;
        dropzone.hidden = false;
        byId("btn-predict").disabled = true;
        if (previousImageUrl !== lastResult?.imageUrl) releaseImageUrl(previousImageUrl);
        byId("screening-title").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    function addSegmentationGroup(group) {
        const card = document.createElement("article");
        card.className = "segmentation-card";
        card.dataset.workstream = group.id;

        const header = document.createElement("div");
        header.className = "segmentation-card-header";
        const heading = document.createElement("div");
        heading.innerHTML = `<div class="section-kicker">U-NET WORKSTREAM</div><h3></h3><small></small>`;
        heading.querySelector("h3").textContent = group.name;
        heading.querySelector("small").textContent = group.outputs.length
            ? `${group.outputs.length} saved evaluation ${group.outputs.length === 1 ? "composite" : "composites"}`
            : "No saved evaluation composites";
        const pill = document.createElement("span");
        pill.className = "segmentation-pill";
        pill.textContent = group.outputs.length ? "REFERENCE ONLY" : "NO OUTPUTS";
        header.append(heading, pill);
        card.append(header);

        if (group.outputs.length) {
            const controls = document.createElement("div");
            controls.className = "segmentation-card-controls";
            const select = document.createElement("select");
            select.setAttribute("aria-label", `Choose a saved ${group.name} evaluation`);
            group.outputs.forEach((output, index) => {
                const option = document.createElement("option");
                option.value = output.url;
                option.textContent = output.id;
                option.dataset.alt = output.alt;
                option.selected = index === 0;
                select.append(option);
            });
            const zoom = document.createElement("div");
            zoom.className = "segmentation-zoom";
            zoom.innerHTML = '<button type="button" aria-label="Zoom out">−</button><span>100%</span><button type="button" aria-label="Zoom in">+</button>';
            controls.append(select, zoom);

            const comparison = document.createElement("div");
            comparison.className = "segmentation-compare";
            const original = document.createElement("img");
            original.className = "comparison-base";
            original.src = group.outputs[0].panels.original;
            original.alt = `Original fundus image ${group.outputs[0].id}`;
            original.loading = "lazy";
            const predictionLayer = document.createElement("div");
            predictionLayer.className = "comparison-overlay";
            predictionLayer.style.clipPath = "inset(0 50% 0 0)";
            const prediction = document.createElement("img");
            prediction.src = group.outputs[0].panels.prediction;
            prediction.alt = `Thresholded segmentation prediction ${group.outputs[0].id}`;
            prediction.loading = "lazy";
            predictionLayer.append(prediction);
            const divider = document.createElement("div");
            divider.className = "comparison-divider";
            divider.style.left = "50%";
            divider.innerHTML = "<span>↔</span>";
            const range = document.createElement("input");
            range.className = "comparison-range";
            range.type = "range";
            range.min = "0";
            range.max = "100";
            range.value = "50";
            range.setAttribute("aria-label", `Compare original image and predicted segmentation for ${group.name}`);
            range.addEventListener("input", () => {
                predictionLayer.style.clipPath = `inset(0 ${100 - Number(range.value)}% 0 0)`;
                divider.style.left = `${range.value}%`;
            });
            comparison.append(original, predictionLayer, divider, range);
            const originalLabel = document.createElement("span");
            originalLabel.className = "comparison-label comparison-label-before";
            originalLabel.textContent = "ORIGINAL";
            const predictionLabel = document.createElement("span");
            predictionLabel.className = "comparison-label comparison-label-after";
            predictionLabel.textContent = "PREDICTION";
            comparison.append(originalLabel, predictionLabel);

            const maskPanel = document.createElement("button");
            maskPanel.type = "button";
            maskPanel.className = "segmentation-mask-panel";
            maskPanel.setAttribute("aria-label", `Open ground-truth mask for ${group.name}`);
            const mask = document.createElement("img");
            mask.src = group.outputs[0].panels.mask;
            mask.alt = `Ground-truth mask ${group.outputs[0].id}`;
            mask.loading = "lazy";
            const maskCaption = document.createElement("span");
            maskCaption.textContent = "GROUND-TRUTH MASK";
            maskPanel.append(mask, maskCaption);
            maskPanel.addEventListener("click", () => openImageModal(mask.src, `${group.name} · ground-truth mask · ${select.options[select.selectedIndex].text}`));

            const footer = document.createElement("div");
            footer.className = "segmentation-card-footer";
            const legend = document.createElement("div");
            legend.className = "segmentation-legend";
            [
                ["legend-swatch", "Original"],
                ["legend-swatch legend-mask", "Ground truth"],
                ["legend-swatch legend-prediction", "Prediction"]
            ].forEach(([className, label]) => {
                const item = document.createElement("span");
                const swatch = document.createElement("i");
                swatch.className = className;
                item.append(swatch, document.createTextNode(label));
                legend.append(item);
            });
            const fullImage = document.createElement("button");
            fullImage.type = "button";
            fullImage.className = "segmentation-composite-link";
            fullImage.textContent = "View full composite ↗";
            fullImage.addEventListener("click", () => {
                const output = group.outputs.find((item) => item.url === select.value);
                if (output) openImageModal(output.url, `${group.name} · ${select.options[select.selectedIndex].text}`);
            });
            footer.append(legend, fullImage);

            let zoomPercent = 100;
            const zoomValue = zoom.querySelector("span");
            const zoomButtons = zoom.querySelectorAll("button");
            const updateZoom = () => {
                [original, prediction, mask].forEach((image) => {
                    image.style.transform = `scale(${zoomPercent / 100})`;
                });
                zoomValue.textContent = `${zoomPercent}%`;
                zoomButtons[0].disabled = zoomPercent <= 100;
                zoomButtons[1].disabled = zoomPercent >= 200;
            };
            zoomButtons[0].addEventListener("click", () => {
                zoomPercent = Math.max(100, zoomPercent - 25);
                updateZoom();
            });
            zoomButtons[1].addEventListener("click", () => {
                zoomPercent = Math.min(200, zoomPercent + 25);
                updateZoom();
            });
            updateZoom();

            select.addEventListener("change", () => {
                const output = group.outputs.find((item) => item.url === select.value);
                if (!output) return;
                original.src = output.panels.original;
                original.alt = `Original fundus image ${output.id}`;
                prediction.src = output.panels.prediction;
                prediction.alt = `Thresholded segmentation prediction ${output.id}`;
                mask.src = output.panels.mask;
                mask.alt = `Ground-truth mask ${output.id}`;
                range.value = "50";
                predictionLayer.style.clipPath = "inset(0 50% 0 0)";
                divider.style.left = "50%";
            });
            card.append(controls, comparison, maskPanel, footer);
        } else {
            const empty = document.createElement("div");
            empty.className = "segmentation-empty";
            empty.textContent = "This workstream has no saved evaluation image in the repository. Its trained checkpoint is not included, so no live result can be generated.";
            card.append(empty);
        }
        return card;
    }

    async function loadSegmentationResults() {
        if (segmentationLoading) return;
        segmentationLoading = true;
        const grid = byId("segmentation-grid");
        grid.replaceChildren();
        const loading = document.createElement("div");
        loading.className = "segmentation-loading";
        loading.innerHTML = '<span class="small-spinner"></span> Loading saved reference images…';
        grid.append(loading);
        try {
            const response = await fetch("/api/segmentation-results");
            if (!response.ok) throw new Error(`Could not load saved segmentation references (${response.status}).`);
            const data = await response.json();
            if (!Array.isArray(data.groups)) throw new Error("The segmentation reference manifest is invalid.");
            segmentationGroups = data.groups;
            const totalOutputs = segmentationGroups.reduce((total, group) => total + group.outputs.length, 0);
            byId("segmentation-result-count").textContent = `${totalOutputs} saved composites · ${segmentationGroups.length} workstreams`;

            const filter = byId("segmentation-filter");
            filter.replaceChildren(new Option("All workstreams", "all"));
            segmentationGroups.forEach((group) => filter.add(new Option(group.name, group.id)));
            grid.replaceChildren(...segmentationGroups.map(addSegmentationGroup));
        } catch (error) {
            grid.replaceChildren();
            const message = document.createElement("div");
            message.className = "segmentation-error";
            message.textContent = error.message || "Saved segmentation references are unavailable.";
            grid.append(message);
            byId("segmentation-result-count").textContent = "Could not load saved outputs";
        } finally {
            segmentationLoading = false;
        }
    }

    byId("segmentation-filter").addEventListener("change", (event) => {
        const selected = event.target.value;
        byId("segmentation-grid").querySelectorAll(".segmentation-card").forEach((card) => {
            card.hidden = selected !== "all" && card.dataset.workstream !== selected;
        });
    });

    const modal = byId("image-modal");
    let modalOpener = null;
    function openImageModal(src, caption) {
        modalOpener = document.activeElement;
        byId("image-modal-content").src = src;
        byId("image-modal-caption").textContent = caption;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        byId("image-modal-close").focus();
    }
    function closeImageModal() {
        if (modalOpener?.isConnected) modalOpener.focus();
        modalOpener = null;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        byId("image-modal-content").removeAttribute("src");
    }
    byId("image-modal-close").addEventListener("click", closeImageModal);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeImageModal();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal.classList.contains("is-open")) closeImageModal();
    });

    const initialView = window.location.hash.slice(1);
    if (pageTitles[initialView]) setView(initialView);
    renderSessionActivity();
    loadSegmentationResults();
})();
