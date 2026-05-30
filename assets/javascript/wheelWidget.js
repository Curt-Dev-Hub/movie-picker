/* =========================================================================
   Custom Title Wheel Widget
   A self-contained "spin your own list" picker, independent of the
   shortlist feature. Self-injects its markup so any page only needs:
     1. <link rel="stylesheet" href="./css/wheel-widget.css">
     2. the canvas-confetti library (optional, for the celebration)
     3. <script type="module" src="./javascript/wheelWidget.js"></script>
     4. a trigger element with [data-custom-wheel-trigger]
   ========================================================================= */

const MIN_TITLES = 2;
const MAX_TITLES = 10;
const CANVAS_SIZE = 500;            // internal canvas resolution
const CENTER = CANVAS_SIZE / 2;
const RADIUS = CANVAS_SIZE / 2;

// Theme-aligned slice palette (blues / cyans), cycled across slices.
const PALETTE = [
    "#1976D2", "#00BCD4", "#0288D1", "#26C6DA", "#039BE5",
    "#4DD0E1", "#0083B0", "#4FC3F7", "#00ACC1", "#5C6BC0"
];

let ctx, canvas, confettiCanvas, myConfetti = null;
let isSpinning = false;
let currentTitles = [];   // titles drawn on the wheel for the current/last spin
let currentRotation = 0;  // persisted wheel rotation (kept after a spin so the pointer stays aligned)

/* ----------------------------- markup ----------------------------------- */
function injectMarkup() {
    if (document.getElementById("cw-modal")) return; // already injected

    const tpl = document.createElement("div");
    tpl.innerHTML = `
    <div id="cw-modal" class="cw-modal cw-hidden" role="dialog" aria-modal="true" aria-labelledby="cw-heading">
        <div class="cw-backdrop" data-cw-dismiss></div>
        <div class="cw-content">
            <button type="button" class="cw-close-x" id="cw-close-x" aria-label="Close">✕</button>
            <h2 id="cw-heading">🎡 Spin Your Own List</h2>
            <p class="cw-sub">Add up to ${MAX_TITLES} movie titles, then spin to let fate decide.</p>

            <div class="cw-layout">
                <div class="cw-input-panel">
                    <div id="cw-inputs" class="cw-inputs"></div>
                    <button type="button" id="cw-add" class="cw-add-btn">+ Add title</button>
                    <p id="cw-hint" class="cw-hint">Add at least ${MIN_TITLES} titles to spin.</p>
                </div>

                <div class="cw-wheel-panel">
                    <div class="cw-wheel-wrap">
                        <div class="cw-pointer">▼</div>
                        <div class="cw-pulse" id="cw-pulse"></div>
                        <canvas id="cw-canvas" class="cw-canvas" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"></canvas>
                        <canvas id="cw-confetti" class="cw-confetti"></canvas>
                    </div>
                    <div class="cw-actions">
                        <button type="button" id="cw-spin" class="cw-spin-btn" disabled>Spin 🎰</button>
                        <button type="button" id="cw-close" class="cw-close-btn">Close</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="cw-winner-modal" class="cw-winner-modal cw-hidden">
        <div class="cw-winner-backdrop" data-cw-winner-dismiss>
            <div class="cw-winner-content">
                <h2>🎉 Tonight's Pick:</h2>
                <p id="cw-winner-title"></p>
                <img src="/pictures/MJ_Popcorn.gif" alt="Celebrating the chosen movie">
                <button type="button" id="cw-winner-close">Awesome!</button>
            </div>
        </div>
    </div>`;

    while (tpl.firstElementChild) {
        document.body.appendChild(tpl.firstElementChild);
    }
}

/* ----------------------------- inputs ------------------------------------ */
function addInputRow(value = "") {
    const list = document.getElementById("cw-inputs");
    if (list.children.length >= MAX_TITLES) return;

    const row = document.createElement("div");
    row.className = "cw-input-row";
    row.innerHTML = `
        <span class="cw-index"></span>
        <input type="text" class="cw-title-input" maxlength="60" placeholder="Movie title" />
        <button type="button" class="cw-remove" aria-label="Remove title">✕</button>`;
    row.querySelector(".cw-title-input").value = value;

    row.querySelector(".cw-remove").addEventListener("click", () => {
        row.remove();
        refresh();
    });
    row.querySelector(".cw-title-input").addEventListener("input", refresh);

    list.appendChild(row);
}

function getTitles() {
    return Array.from(document.querySelectorAll(".cw-title-input"))
        .map(i => i.value.trim())
        .filter(Boolean);
}

// Re-number rows, sync button states, and redraw the wheel preview.
function refresh() {
    document.querySelectorAll("#cw-inputs .cw-input-row").forEach((row, i) => {
        row.querySelector(".cw-index").textContent = i + 1;
    });

    const rowCount = document.querySelectorAll("#cw-inputs .cw-input-row").length;
    document.getElementById("cw-add").disabled = rowCount >= MAX_TITLES;

    const titles = getTitles();
    const spinBtn = document.getElementById("cw-spin");
    const hint = document.getElementById("cw-hint");

    spinBtn.disabled = isSpinning || titles.length < MIN_TITLES;
    hint.textContent = titles.length < MIN_TITLES
        ? `Add at least ${MIN_TITLES} titles to spin.`
        : `${titles.length} titles ready — give it a spin!`;

    if (!isSpinning) {
        currentTitles = titles;
        drawWheel(currentTitles, currentRotation);
    }
}

/* ----------------------------- drawing ----------------------------------- */
function drawWheel(titles, rotation) {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (titles.length === 0) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "bold 22px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText("Add titles…", CENTER, CENTER);
        ctx.restore();
        return;
    }

    const arc = (2 * Math.PI) / titles.length;

    titles.forEach((title, index) => {
        const start = index * arc + rotation;
        const end = start + arc;

        ctx.beginPath();
        ctx.moveTo(CENTER, CENTER);
        ctx.arc(CENTER, CENTER, RADIUS, start, end);
        ctx.fillStyle = PALETTE[index % PALETTE.length];
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Title text along the slice
        ctx.save();
        ctx.translate(CENTER, CENTER);
        ctx.rotate(start + arc / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 16px Georgia, serif";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 5;
        const maxChars = 16;
        const label = title.length > maxChars ? title.slice(0, maxChars) + "…" : title;
        ctx.fillText(label, RADIUS - 14, 5);
        ctx.restore();
    });
}

function highlightWinnerSlice(index, titles, rotation) {
    const arc = (2 * Math.PI) / titles.length;
    const start = index * arc + rotation;
    const end = start + arc;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, RADIUS, start, end);
    ctx.fillStyle = "rgba(255, 255, 0, 0.35)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#FFD700";
    ctx.stroke();
    ctx.restore();
}

/* ----------------------------- spinning ---------------------------------- */
function spin() {
    if (isSpinning) return;
    const titles = getTitles();
    if (titles.length < MIN_TITLES) return;

    isSpinning = true;
    currentTitles = titles;
    document.getElementById("cw-spin").disabled = true;
    document.getElementById("cw-add").disabled = true;

    const sliceAngle = (2 * Math.PI) / titles.length;
    let angle = 0;
    let velocity = 0.45 + Math.random() * 0.2;
    const friction = 0.985;

    function animate() {
        velocity *= friction;
        angle += velocity;
        drawWheel(titles, angle);

        if (velocity < 0.002) {
            // Pointer sits at the top (12 o'clock = 3π/2 in canvas coords,
            // where 0 rad is 3 o'clock and angles increase clockwise).
            const pointerAngle = 3 * Math.PI / 2;
            let relative = (pointerAngle - angle) % (2 * Math.PI);
            if (relative < 0) relative += 2 * Math.PI;
            const index = Math.floor(relative / sliceAngle) % titles.length;

            // Keep the wheel at its final rotation so the pointer stays over
            // the winning slice. refresh() repaints the wheel + re-enables the
            // controls; the highlight is drawn on top afterwards.
            isSpinning = false;
            currentRotation = angle;
            refresh();
            highlightWinnerSlice(index, titles, angle);
            celebrate(titles[index]);
            return;
        }
        requestAnimationFrame(animate);
    }
    animate();
}

function celebrate(winner) {
    if (myConfetti) {
        myConfetti({ particleCount: 200, spread: 80, startVelocity: 40, origin: { y: 0.4 } });
    }
    const pulse = document.getElementById("cw-pulse");
    pulse.classList.add("active");
    setTimeout(() => pulse.classList.remove("active"), 600);

    setTimeout(() => {
        document.getElementById("cw-winner-title").textContent = winner;
        document.getElementById("cw-winner-modal").classList.remove("cw-hidden");
    }, 700);
}

/* ----------------------------- open / close ------------------------------ */
function openModal() {
    document.getElementById("cw-modal").classList.remove("cw-hidden");
    // Seed with two empty rows the first time it's opened.
    if (document.querySelectorAll("#cw-inputs .cw-input-row").length === 0) {
        addInputRow();
        addInputRow();
    }
    refresh();
}
function closeModal() {
    document.getElementById("cw-modal").classList.add("cw-hidden");
}

/* ----------------------------- init -------------------------------------- */
function init() {
    injectMarkup();

    canvas = document.getElementById("cw-canvas");
    ctx = canvas.getContext("2d");
    confettiCanvas = document.getElementById("cw-confetti");

    if (typeof confetti !== "undefined") {
        myConfetti = confetti.create(confettiCanvas, { resize: true });
    }

    document.getElementById("cw-add").addEventListener("click", () => {
        addInputRow();
        refresh();
    });
    document.getElementById("cw-spin").addEventListener("click", spin);
    document.getElementById("cw-close").addEventListener("click", closeModal);
    document.getElementById("cw-close-x").addEventListener("click", closeModal);
    document.querySelector("[data-cw-dismiss]").addEventListener("click", closeModal);

    document.getElementById("cw-winner-close").addEventListener("click", () => {
        document.getElementById("cw-winner-modal").classList.add("cw-hidden");
    });
    document.querySelector("[data-cw-winner-dismiss]").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById("cw-winner-modal").classList.add("cw-hidden");
        }
    });

    // Esc closes whichever modal is open.
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const winner = document.getElementById("cw-winner-modal");
        if (!winner.classList.contains("cw-hidden")) { winner.classList.add("cw-hidden"); return; }
        if (!document.getElementById("cw-modal").classList.contains("cw-hidden")) closeModal();
    });

    // Wire any trigger buttons on the page.
    document.querySelectorAll("[data-custom-wheel-trigger]").forEach(btn => {
        btn.addEventListener("click", openModal);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
