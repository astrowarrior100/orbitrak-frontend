// Read NORAD ID from URL
const params = new URLSearchParams(window.location.search);
const noradId = params.get("norad");

// Global scale so real‑world km fit nicely in Three.js
// Earth radius (6371 km) → ~100 units
const SCALE = 0.0157;
const EARTH_RADIUS_KM = 6371;

// Load stored scan results so scanner.html does NOT reset
const storedResults = JSON.parse(localStorage.getItem("orbitrak_scan_results") || "[]");

// Try to find the selected object in stored scan results
const selectedObj = storedResults.find(o => String(o.norad_id) === String(noradId));

// Back button
document.getElementById("backToResultsBtn").addEventListener("click", () => {
    window.location.href = "scanner.html";
});

// Play/pause state
let isPaused = false;
document.getElementById("playPauseBtn").addEventListener("click", () => {
    isPaused = !isPaused;
    document.getElementById("playPauseBtn").textContent = isPaused ? "Play" : "Pause";
});

// Fetch TLE from your backend (fallback if not stored)
async function fetchTLE(norad) {
    const res = await fetch(`https://orbitrak-backend.onrender.com/tle/${norad}`);
    return await res.json();
}

// Live overlay satellites (ISS, Starlink, GPS)
const liveSatellites = [
    { name: "ISS", norad: 25544, color: 0x00ff00 },
    { name: "Starlink 1001", norad: 44714, color: 0xff00ff },
    { name: "GPS BIIR-2", norad: 24876, color: 0xffff00 }
];

async function loadLiveSats() {
    const sats = [];
    for (const s of liveSatellites) {
        try {
            const tle = await fetch(`https://orbitrak-backend.onrender.com/tle/${s.norad}`).then(r => r.json());
            if (!tle.line1 || !tle.line2) continue;
            sats.push({
                name: s.name,
                satrec: satellite.twoline2satrec(tle.line1, tle.line2),
                mesh: new THREE.Mesh(
                    new THREE.SphereGeometry(3, 16, 16),
                    new THREE.MeshBasicMaterial({ color: s.color })
                )
            });
        } catch (e) {
            console.warn("Failed to load live sat", s.name, e);
        }
    }
    return sats;
}

async function init() {
    if (!noradId) return;

    // Prefer TLE from stored scan results if available
    let line1, line2, tleMeta = {};

    try {
        if (selectedObj && selectedObj.tle_line1 && selectedObj.tle_line2) {
            line1 = selectedObj.tle_line1;
            line2 = selectedObj.tle_line2;
            tleMeta = selectedObj;
        } else {
            const tle = await fetchTLE(noradId);
            if (!tle.line1 || !tle.line2) throw new Error("Invalid TLE");
            line1 = tle.line1;
            line2 = tle.line2;
            tleMeta = tle;
        }
    } catch (err) {
        console.error("TLE load failed:", err);
        alert("Could not load TLE for this object.");
        return;
    }

    // Convert TLE to satellite record
    const satrec = satellite.twoline2satrec(line1, line2);

    // Compute current position and velocity from TLE
    const now = new Date();
    const pv = satellite.propagate(satrec, now);

    if (pv.position && pv.velocity) {
        const pos = pv.position;
        const vel = pv.velocity;

            // Altitude (km)
            const r = Math.sqrt(pos.x**2 + pos.y**2 + pos.z**2);
            const altitudeKm = r - EARTH_RADIUS_KM;

            // Velocity magnitude (km/s)
            const velocityKms = Math.sqrt(
                vel.x**2 + vel.y**2 + vel.z**2
            );

            // Orbit type (simple classification)
            let orbitType = "Unknown";
            if (altitudeKm < 2000) orbitType = "LEO";
            else if (altitudeKm < 35786) orbitType = "MEO";
            else orbitType = "GEO";

            // Attach to metadata so UI can use it
            tleMeta.altitude_km = altitudeKm.toFixed(1);
            tleMeta.velocity_kms = velocityKms.toFixed(2);
            tleMeta.orbit_type = orbitType;
    }

    // THREE.js scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f25);

    const camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        50000
    );

    // Camera distance tuned for Earth ≈ 100 units
    camera.position.set(0, 0, 800);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById("orbitContainer").appendChild(renderer.domElement);

    // OrbitControls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.minDistance = 50;
    controls.maxDistance = 5000;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;

    // Textures (use a better Earth with borders if available)
    const loader = new THREE.TextureLoader();
    const dayTexture = loader.load("assets/earth_borders.jpg"); // high-res with borders
    const nightTexture = loader.load("assets/earth_night.jpg");
    const cloudsTexture = loader.load("assets/earth_clouds.jpg");
   
    // Earth sphere
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS_KM * SCALE, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
    map: dayTexture,
    roughness: 1.0,
    metalness: 0.0
});

    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);

    // Cloud layer
    const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS_KM * SCALE * 1.01, 64, 64);
    const cloudMat = new THREE.MeshLambertMaterial({
        map: cloudsTexture,
        transparent: true,
        opacity: 0.35
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(clouds);

    // Atmospheric glow
    const atmosphereGeo = new THREE.SphereGeometry(EARTH_RADIUS_KM * SCALE * 1.05, 64, 64);
    const atmosphereMat = new THREE.MeshBasicMaterial({
        color: 0x4da6ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide
    });
    const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    scene.add(atmosphere);

    // Lighting: sunlight + soft night side
    // --- FINAL EARTH LIGHTING SETUP ---

       // Global ambient light (brightens everything evenly)
const ambient = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambient);

// Sunlight
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(200, 200, 150);
scene.add(sunLight);

// Soft fill light for the night side
const fillLight = new THREE.HemisphereLight(0xffffff, 0x222233, 0.8);
scene.add(fillLight);




    // Orbit path + ground track
    const orbitPoints = [];
    const groundTrackPoints = [];

    for (let i = 0; i < 360; i++) {
        const time = new Date(Date.now() + i * 60000);
        const prop = satellite.propagate(satrec, time);
        if (!prop.position) continue;

        const posEci = prop.position;
        const gmst = satellite.gstime(time);

        // ECI → ECF for 3D orbit
        const posEcf = satellite.eciToEcf(posEci, gmst);

        orbitPoints.push(new THREE.Vector3(
            posEcf.x * SCALE,
            posEcf.y * SCALE,
            posEcf.z * SCALE
        ));

        // Ground track
        const geo = satellite.eciToGeodetic(posEci, gmst);
        const lat = geo.latitude;
        const lon = geo.longitude;

        const r = EARTH_RADIUS_KM * SCALE * 1.001;
        const x = r * Math.cos(lat) * Math.cos(lon);
        const y = r * Math.cos(lat) * Math.sin(lon);
        const z = r * Math.sin(lat);

        groundTrackPoints.push(new THREE.Vector3(x, y, z));
    }

    // Orbit line
    const orbitLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(orbitPoints),
        new THREE.LineBasicMaterial({ color: 0x00eaff })
    );
    scene.add(orbitLine);

    // Ground track line
    const groundTrackLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(groundTrackPoints),
        new THREE.LineBasicMaterial({ color: 0xffcc00 })
    );
    scene.add(groundTrackLine);

    // Debris marker (visible size)
    const debrisGeo = new THREE.SphereGeometry(4, 16, 16);
    const debrisMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const debris = new THREE.Mesh(debrisGeo, debrisMat);
    scene.add(debris);

    // Live overlay satellites
    const liveMeshes = await loadLiveSats();
    liveMeshes.forEach(s => scene.add(s.mesh));

    // Animate debris along orbit
    let t = 0;
    function animate() {
        requestAnimationFrame(animate);

        if (!isPaused) {
            t = (t + 0.1) % 360;
        }

        const time = new Date(Date.now() + t * 60000);
        const prop = satellite.propagate(satrec, time);

        if (prop.position) {
            const posEci = prop.position;
            const gmst = satellite.gstime(time);
            const posEcf = satellite.eciToEcf(posEci, gmst);

            debris.position.set(
                posEcf.x * SCALE,
                posEcf.y * SCALE,
                posEcf.z * SCALE
            );
        }

        // Update live overlay sats in real time
        const now = new Date();
        for (const s of liveMeshes) {
            const p = satellite.propagate(s.satrec, now);
            if (!p.position) continue;
            const gmst = satellite.gstime(now);
            const pos = satellite.eciToEcf(p.position, gmst);
            s.mesh.position.set(
                pos.x * SCALE,
                pos.y * SCALE,
                pos.z * SCALE
            );
        }

        controls.update();
        renderer.render(scene, camera);
    }

    animate();

    // Update info panel (avoid N/A pushing layout)
    document.getElementById("objName").textContent = tleMeta.name || "Unknown";
    document.getElementById("objNorad").textContent = noradId;
    document.getElementById("objOrbit").textContent = tleMeta.orbit_type;
    document.getElementById("objAlt").textContent = `${tleMeta.altitude_km} km`;
    document.getElementById("objVel").textContent = `${tleMeta.velocity_kms} km/s`;


    // Handle resize
    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

init();
