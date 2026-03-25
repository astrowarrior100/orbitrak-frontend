let isTableMode = false;
// Detect if we are on scanner.html
const isScannerPage = window.location.pathname.includes("scanner.html");
let currentPage = 1;
let resultsPerPage = 5;
let globalResults = [];
let filteredResults = [];


function goToScanner() {
    // ⭐ Always clear old results before starting a new scan
    localStorage.removeItem("orbitrak_scan_results");
    window.location.href = "scanner.html";
}

function startScan() {
    // ⭐ Clear old results to avoid stale data
    localStorage.removeItem("orbitrak_scan_results");

    document.getElementById("step2").classList.add("hidden");
    document.getElementById("loadingScreen").classList.remove("hidden");

    simulateLoading();
    runScan();
}

async function runScan() {
    const lat = parseFloat(document.getElementById("latInput").value);
    const lon = parseFloat(document.getElementById("lonInput").value);
    const radius = parseFloat(document.getElementById("radiusInput").value);

    try {
        const response = await fetch("https://orbitrak-backend.onrender.com/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude: lat, longitude: lon, radius_km: radius })
        });

        if (!response.ok) {
            throw new Error("Server returned " + response.status);
        }

        const data = await response.json();
        console.log("Received data:", data);
        showResults(data.results);

    } catch (err) {
        console.error("Fetch error:", err);
        document.getElementById("loadingStatus").textContent =
            "Error: Could not load results.";
    }
}


function updateRadiusPreview(lat, lon, radiusKm) {
    const img = document.getElementById("radiusBaseImage");
    const canvas = document.getElementById("radiusCanvas");
    const ctx = canvas.getContext("2d");

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isNaN(lat) || isNaN(lon) || isNaN(radiusKm)) return;

    // Convert lat/lon to canvas coordinates (approximate)
    const x = ((lon + 180) / 360) * canvas.width;
    const y = ((90 - lat) / 180) * canvas.height;

    // Draw red dot
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Label: Your Coordinate
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.fillText("Your Coordinate", x + 8, y - 8);

    // Draw search radius
    const radiusPx = radiusKm * 0.15;
    ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();

    // Label: Search Radius
    ctx.fillText("Search Radius", x + radiusPx + 6, y);
}


document.getElementById("latInput").addEventListener("input", handlePreviewUpdate);
document.getElementById("lonInput").addEventListener("input", handlePreviewUpdate);
document.getElementById("radiusInput").addEventListener("input", handlePreviewUpdate);

function handlePreviewUpdate() {
    const lat = parseFloat(document.getElementById("latInput").value);
    const lon = parseFloat(document.getElementById("lonInput").value);
    const radius = parseFloat(document.getElementById("radiusInput").value);

    updateRadiusPreview(lat, lon, radius);
}




function showResults(results) {
    console.log("Results received:", results);

    document.getElementById("loadingScreen").classList.add("hidden");
    document.getElementById("resultsPage").classList.remove("hidden");

    globalResults = results;

    // ⭐ Save results so Orbit Visualizer can access them
    localStorage.setItem("orbitrak_scan_results", JSON.stringify(results));

    // ⭐ NEW: Set timestamp when results arrive
    setSnapshotTimestamp();

    applyFiltersAndSorting();
    currentPage = 1;

    setTimeout(() => {
        renderPage();
    }, 50);
}


function applyFiltersAndSorting() {
    const sortVal = document.getElementById("sortSelect").value;
    const orbitVal = document.getElementById("orbitFilter").value;
    const sizeVal = document.getElementById("sizeFilter").value;
    const materialVal = document.getElementById("materialFilter").value;
    const countryVal = document.getElementById("countryFilter").value;

    let arr = [...globalResults];

    // Orbit filter
    arr = arr.filter(obj => {
        if (orbitVal === "all") return true;

        const orbitStr = (obj.orbit_classification?.orbit || "").toLowerCase();

        if (orbitVal === "LEO") return orbitStr.includes("leo");
        if (orbitVal === "MEO") return orbitStr.includes("meo");
        if (orbitVal === "GEO") return orbitStr.includes("geo") && !orbitStr.includes("gto");
        if (orbitVal === "GTO") return orbitStr.includes("gto");
        if (orbitVal === "SSO") return orbitStr.includes("sso");

        return true;
    });

    // Size filter
    arr = arr.filter(obj => {
        if (sizeVal === "all") return true;

        const min = parseFloat(obj.size_estimate?.approx_min_size_cm || 0);
        const max = parseFloat(obj.size_estimate?.approx_max_size_cm || 0);
        const charSize = (min + max) / 2;

        if (sizeVal === "small") return charSize < 10;
        if (sizeVal === "medium") return charSize >= 10 && charSize <= 100;
        if (sizeVal === "large") return charSize > 100;

        return true;
    });

    // Material filter
    arr = arr.filter(obj => {
        if (materialVal === "all") return true;
        const mat = (obj.material_estimate?.material || "").toLowerCase();
        return mat.includes(materialVal);
    });

    // Country filter
    arr = arr.filter(obj => {
        if (countryVal === "all") return true;

        const code = (obj.country || "").toUpperCase();
        const known = ["US","PRC","IND","CIS","FR","UK","JP","BR","ESA"];

        if (countryVal === "OTHER") {
            return !known.includes(code);
        }

        return code === countryVal;
    });

    // Sorting
    arr.sort((a, b) => {
        const dangerA = a.danger_score_final ?? 0;
        const dangerB = b.danger_score_final ?? 0;
        const altA = a.altitude_km ?? 0;
        const altB = b.altitude_km ?? 0;
        const velA = a.velocity_kms ?? 0;
        const velB = b.velocity_kms ?? 0;

        switch (sortVal) {
            case "danger_desc": return dangerB - dangerA;
            case "altitude_desc": return altB - altA;
            case "altitude_asc": return altA - altB;
            case "velocity_desc": return velB - velA;
            default: return 0;
        }
    });

    filteredResults = arr;
}


// ⭐ NEW: Snapshot timestamp
function setSnapshotTimestamp() {
    const ts = document.getElementById("snapshotTimestamp");
    if (ts) {
        ts.textContent = "Snapshot taken: " + new Date().toLocaleString();
    }
}

function renderPage() {
    console.log("🔄 renderPage() called");
    console.log("📄 Current page:", currentPage);

    const container = document.getElementById("resultsContainer");
    container.innerHTML = "";

    const start = (currentPage - 1) * resultsPerPage;
    const end = start + resultsPerPage;

    const total = filteredResults.length;
    const startIdx = total === 0 ? 0 : start + 1;
    const endIdx = Math.min(end, total);

    document.getElementById("resultsSummary").textContent =
        `Showing ${startIdx}-${endIdx} of ${total} results`;

    const pageResults = filteredResults.slice(start, end);

    console.log(`📦 Rendering items ${start} to ${end - 1}`);
    console.log("📦 Page results:", pageResults);

    pageResults.forEach((obj, index) => {
        console.log(`🧩 Rendering object #${start + index}`, obj);

        const safeNum = (val, digits = 2) =>
            typeof val === "number" && !isNaN(val)
                ? val.toFixed(digits)
                : "N/A";

        const safeText = (val) =>
            val !== undefined && val !== null && val !== "" ? val : "N/A";

        const safeRound = (val) =>
            typeof val === "number" && !isNaN(val)
                ? Math.round(val)
                : "N/A";

        const card = document.createElement("div");
        card.className = "result-card";

        const dangerVal = typeof obj.danger_score_final === "number"
            ? obj.danger_score_final
            : null;

        let dangerClass = "danger-low";
        if (dangerVal !== null) {
            if (dangerVal >= 7) dangerClass = "danger-high";
            else if (dangerVal >= 4) dangerClass = "danger-medium";
        }

        const orbitStr = (obj.orbit_classification?.orbit || "");
        const orbitLower = orbitStr.toLowerCase();

        let orbitClass = "tag-orbit-default";
        if (orbitLower.includes("leo")) orbitClass = "tag-orbit-leo";
        else if (orbitLower.includes("meo")) orbitClass = "tag-orbit-meo";
        else if (orbitLower.includes("gto")) orbitClass = "tag-orbit-gto";
        else if (orbitLower.includes("geo")) orbitClass = "tag-orbit-geo";
        else if (orbitLower.includes("sso")) orbitClass = "tag-orbit-sso";

        let countryCode = (obj.country || "").toUpperCase().trim();

        if (countryCode.includes("PRC") || countryCode.includes("CN")) countryCode = "CN";
        if (countryCode.includes("CIS") || countryCode.includes("RU")) countryCode = "RU";
        if (countryCode.includes("US")) countryCode = "US";
        if (countryCode.includes("IND")) countryCode = "IN";
        if (countryCode.includes("FR")) countryCode = "FRA";
        if (countryCode.includes("UK")) countryCode = "GB";
        if (countryCode.includes("CZ")) countryCode = "CZ";

        const flagFileMap = {
            "US": "us.svg",
            "CN": "cn.svg",
            "IN": "in.svg",
            "RU": "ru.svg",
            "FRA": "fr.svg",
            "GB": "gb.svg",
            "CZ": "cz.svg"
        };

        const flagFile = flagFileMap[countryCode] || "oth.svg";

        const minSize = parseFloat(obj.size_estimate?.approx_min_size_cm || 0);
        const maxSize = parseFloat(obj.size_estimate?.approx_max_size_cm || 0);
        const charSize = (minSize + maxSize) / 2;

        let sizeLabel = "Small";
        let sizeClass = "size-small";
        if (charSize >= 10 && charSize <= 100) {
            sizeLabel = "Medium";
            sizeClass = "size-medium";
        } else if (charSize > 100) {
            sizeLabel = "Large";
            sizeClass = "size-large";
        }

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3>${safeText(obj.name)}
                        <span class="size-badge ${sizeClass}">${sizeLabel}</span>
                    </h3>
                    <div class="meta-tags">
                        <span class="tag tag-orbit ${orbitClass}">
                            ${safeText(orbitStr)}
                        </span>
                        <span class="tag tag-country">
                            <img class="flag-icon" src="assets/flags/${flagFile}" alt="${countryCode} flag">
                            ${countryCode}
                        </span>
                    </div>
                </div>
                <span class="norad">NORAD: ${safeText(obj.norad_id)}</span>
            </div>

            <div class="card-main">
                <p><strong>Alt:</strong> ${safeNum(obj.altitude_km)} km</p>
                <p><strong>Vel:</strong> ${safeNum(obj.velocity_kms)} km/s</p>
                <p>
                <strong>Danger:</strong>
                <span class="danger-pill ${dangerClass}">
                    ${safeNum(obj.danger_score_final)}
                </span>
                </p>
            </div>

            <button class="view-orbit-btn" data-norad="${obj.norad_id}">
                View on Orbit Visualizer
            </button>

            <button class="details-btn" onclick="toggleDetails(this)">Show details ▼</button>

            <div class="details">
                <h4>Orbital information</h4>
                <div class="details-group">
                    <p><strong>Eccentricity:</strong> ${safeNum(obj.eccentricity, 4)}</p>
                    <p><strong>Inclination:</strong> ${safeNum(obj.inclination_deg)}°</p>
                    <p><strong>Perigee:</strong> ${safeNum(obj.perigee_km)} km</p>
                    <p><strong>Apogee:</strong> ${safeNum(obj.apogee_km)} km</p>
                </div>

                <h4>Size estimate</h4>
                <div class="details-group">
                    <p><strong>Min size:</strong> ${safeText(obj.size_estimate?.approx_min_size_cm)} cm</p>
                    <p><strong>Max size:</strong> ${safeText(obj.size_estimate?.approx_max_size_cm)} cm</p>
                </div>

                <h4>Material estimate</h4>
                <div class="details-group">
                    <p><strong>Material:</strong> ${safeText(obj.material_estimate?.material)}</p>
                </div>

                <h4>Mass estimate</h4>
                <div class="details-group">
                    <p><strong>Mass:</strong> ${safeRound(obj.mass_estimate?.mass_kg)} kg</p>
                </div>

                <h4>Danger score breakdown</h4>
                <div class="details-group">
                    <p><strong>Altitude risk:</strong> ${
                        obj.altitude_km > 20000 ? "High (MEO/GEO region)" :
                        obj.altitude_km > 2000 ? "Medium (MEO/HEO)" :
                        "Low–Medium (LEO)"
                    }</p>
                    <p><strong>Velocity risk:</strong> ${
                        obj.velocity_kms > 8 ? "High relative velocity" :
                        obj.velocity_kms > 4 ? "Moderate relative velocity" :
                        "Lower relative velocity"
                    }</p>
                    <p><strong>Mass/size risk:</strong> ${
                        charSize > 100 ? "Large, potentially catastrophic debris" :
                        charSize > 10 ? "Medium, mission‑threatening debris" :
                        "Small, still dangerous at orbital speeds"
                    }</p>
                </div>

            </div>
        `;

        // ⭐ NEW: Add click handler for Orbit Visualizer
        card.querySelector(".view-orbit-btn").addEventListener("click", () => {
            window.location.href = `visualizer.html?norad=${obj.norad_id}`;
        });

        container.appendChild(card);
    });

    renderPaginationControls();
}

function toggleDetails(btn) {
    const details = btn.nextElementSibling;
    const isOpen = details.classList.contains("open");

    if (isOpen) {
        details.style.maxHeight = "0px";
        details.classList.remove("open");
        btn.classList.remove("open");
        btn.textContent = "Show details ▼";
    } else {
        details.classList.add("open");
        btn.classList.add("open");
        btn.textContent = "Hide details ▲";
        details.style.maxHeight = details.scrollHeight + "px";
    }
}

function nextPage() {
    currentPage++;
    renderPage();
}

function prevPage() {
    currentPage--;
    renderPage();
}


if (isScannerPage) {

function goToStep2() {
    document.getElementById("step1").classList.add("hidden");
    document.getElementById("step2").classList.remove("hidden");
}

function simulateLoading() {
    let progress = 0;
    const fill = document.getElementById("progressFill");
    const status = document.getElementById("loadingStatus");

    const messages = [
        "Loading Skyfield...",
        "Fetching TLE data...",
        "Propagating orbits...",
        "Computing danger scores...",
        "Finalizing results..."
    ];

    const interval = setInterval(() => {
        progress += 20;
        fill.style.width = progress + "%";
        status.textContent = messages[(progress / 20) - 1];

        if (progress >= 100) clearInterval(interval);
    }, 800);
}


function renderPaginationControls() {
    const totalPages = Math.ceil(filteredResults.length / resultsPerPage);
    const pagination = document.getElementById("paginationControls");

    pagination.innerHTML = `
        <button onclick="prevPage()" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
        <span>Page ${currentPage} of ${totalPages}</span>
        <button onclick="nextPage()" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
    `;
}

function renderResults(list) {
    const container = document.getElementById("resultsContainer");
    container.innerHTML = "";  // clear old results

    list.forEach(obj => {
        const div = document.createElement("div");
        div.className = "result-item";
        div.innerHTML = `
            <h3>${obj.name}</h3>
            <p>NORAD: ${obj.norad_id}</p>
            <p>Danger Score: ${obj.danger_score}</p>
        `;
        container.appendChild(div);
    });
}



window.addEventListener("DOMContentLoaded", () => {

    // Only run scanner UI logic if scanner elements exist
    const step1 = document.getElementById("step1");
    const resultsPage = document.getElementById("resultsPage");

    // If we are NOT on the scanner page, exit early
    if (!step1 || !resultsPage) {
        return;
    }

    const saved = localStorage.getItem("orbitrak_scan_results");
    if (saved) {
        const results = JSON.parse(saved);

        step1.classList.add("hidden");
        resultsPage.classList.remove("hidden");

        globalResults = results;
        applyFiltersAndSorting();
        renderPage();
    }

    // ⭐ Danger slider
    const dangerSlider = document.getElementById("dangerThreshold");
    const dangerValue = document.getElementById("dangerValue");

    if (dangerSlider) {
        dangerSlider.addEventListener("input", () => {
            const threshold = parseFloat(dangerSlider.value);
            dangerValue.textContent = threshold.toFixed(1);

            filteredResults = globalResults.filter(obj =>
                (obj.danger_score_final ?? 0) >= threshold
            );

            currentPage = 1;
            renderPage();
        });
    }

    // ⭐ Top 10 button
    const top10Btn = document.getElementById("btnTop10");
    if (top10Btn) {
        top10Btn.addEventListener("click", () => {
            filteredResults = globalResults
                .slice()
                .sort((a, b) => (b.danger_score_final ?? 0) - (a.danger_score_final ?? 0))
                .slice(0, 10);

            currentPage = 1;
            renderPage();          

            const showAllBtn = document.getElementById("btnShowAll");
            if (showAllBtn) showAllBtn.style.display = "inline-block";
        });
    }

    // ⭐ Min Danger button
    const minDangerBtn = document.getElementById("btnMinDanger");
    if (minDangerBtn) {
        minDangerBtn.addEventListener("click", () => {
            filteredResults = globalResults
                .slice()
                .sort((a, b) => (a.danger_score_final ?? 0) - (b.danger_score_final ?? 0))
                .slice(0, 10);

            currentPage = 1;
            renderPage();       

            const showAllBtn = document.getElementById("btnShowAll");
            if (showAllBtn) showAllBtn.style.display = "inline-block";
        });
    }

    document.getElementById("btnShowAll").addEventListener("click", () => {
        filteredResults = globalResults
            .sort((a, b) => (b.danger_score_final ?? 0) - (a.danger_score_final ?? 0));

         currentPage = 1;
         renderPage(); 
    });

    // ⭐ Filters
    ["sortSelect", "orbitFilter", "sizeFilter", "materialFilter", "countryFilter"]
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("change", () => {
                    applyFiltersAndSorting();
                    currentPage = 1;
                    renderPage();
                });
            }
        });

    // ⭐ View mode toggle
    const viewToggle = document.getElementById("viewModeToggle");
    if (viewToggle) {
        viewToggle.addEventListener("click", () => {
            isTableMode = !isTableMode;
            document.body.classList.toggle("table-mode", isTableMode);
            viewToggle.textContent = isTableMode
                ? "Switch to card mode"
                : "Switch to table mode";
            renderPage();
        });
    }

    // ⭐ PDF button
    const pdfBtn = document.getElementById("downloadPdfBtn");
    if (pdfBtn) {
        pdfBtn.addEventListener("click", () => {
            window.print();
        });
    }
});
}