(function () {
    'use strict';

    const D = window.BALLISTIC_DATA;
    const $ = (id) => document.getElementById(id);

    const weaponSel = $('weapon');
    const bulletSel = $('bullet');
    const v0Input = $('v0');
    const bcInput = $('bc');
    const massInput = $('mass');
    const sightInput = $('sight');
    const zeroInput = $('zero');
    const tbody = $('ballistic-tbody');

    D.weapons.forEach((w, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = w;
        weaponSel.appendChild(o);
    });
    D.bullets.forEach((b, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = b;
        bulletSel.appendChild(o);
    });

    // Defaults from spreadsheet: M4A1 14.5" + M855 SS109
    weaponSel.value = 0;
    bulletSel.value = 1;

    let v0Overridden = false;

    function getCombo() {
        const w = parseInt(weaponSel.value, 10);
        const b = parseInt(bulletSel.value, 10);
        return D.matrix[w][b];
    }

    function refreshAuto() {
        const wIdx = parseInt(weaponSel.value, 10);
        const bIdx = parseInt(bulletSel.value, 10);
        const bulletName = D.bullets[bIdx];
        const meta = D.bullet_meta[bulletName];
        const combo = D.matrix[wIdx][bIdx];

        // Auto v0 = combo.vel[0]
        if (!v0Overridden) {
            v0Input.value = Math.round(combo.vel[0]);
        }
        bcInput.value = meta.bc_g1;
        massInput.value = meta.mass_gr;
    }

    // Linear interpolation helper on the pre-computed range grid
    function interp(xs, ys, x) {
        if (x <= xs[0]) return ys[0];
        if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
        for (let i = 1; i < xs.length; i++) {
            if (x <= xs[i]) {
                const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
                return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
            }
        }
        return ys[ys.length - 1];
    }

    function fmt(v, decimals) {
        if (!isFinite(v)) return '—';
        return Number(v.toFixed(decimals)).toString();
    }

    function pathClass(cm) {
        if (Math.abs(cm) < 0.05) return 'path-zero';
        return cm > 0 ? 'path-positive' : 'path-negative';
    }

    function render() {
        const combo = getCombo();
        const ranges = D.ranges;

        const sightMm = parseFloat(sightInput.value) || 0;
        const sightCm = sightMm / 10;
        const zeroDist = Math.max(parseFloat(zeroInput.value) || 0, 1);

        // drop at zero distance (cm) — interpolate from the pure-drop curve
        const dropAtZero = interp(ranges, combo.drop, zeroDist);

        // velocity scaling: if user overrode v0, scale velocity proportionally to the
        // baseline first velocity from the table (so the same shape, different scale).
        const baseV0 = combo.vel[0];
        const userV0 = parseFloat(v0Input.value) || baseV0;
        const velScale = userV0 / baseV0;

        tbody.innerHTML = '';
        const frag = document.createDocumentFragment();

        for (let i = 0; i < ranges.length; i++) {
            const r = ranges[i];
            const drop = combo.drop[i];          // cm (pure gravity drop)
            const vel  = combo.vel[i] * velScale; // m/s (scaled if v0 overridden)
            const time = combo.time[i];           // s
            const energy = combo.energy[i] * velScale * velScale; // E ∝ v²

            // Trajectory above LOS at range r (cm):
            //   path = -sight_cm + r*(sight_cm + drop_at_zero) / zero_dist - drop(r)
            let path;
            if (r === 0) {
                path = -sightCm;
            } else {
                path = -sightCm + r * (sightCm + dropAtZero) / zeroDist - drop;
            }

            const moa = r > 0 ? (path * 100) / (2.908 * r) : 0;

            const tr = document.createElement('tr');
            if (Math.abs(r - zeroDist) < 0.01) tr.classList.add('zero-row');

            const cls = pathClass(path);
            tr.innerHTML =
                '<td>' + fmt(r, 0) + '</td>' +
                '<td>' + fmt(time, 4) + '</td>' +
                '<td>' + fmt(vel, 1) + '</td>' +
                '<td>' + fmt(energy, 0) + '</td>' +
                '<td>' + fmt(drop, 2) + '</td>' +
                '<td class="' + cls + '">' + fmt(path, 2) + '</td>' +
                '<td class="' + cls + '">' + fmt(moa, 2) + '</td>';
            frag.appendChild(tr);
        }
        tbody.appendChild(frag);
    }

    function recompute() {
        refreshAuto();
        render();
    }

    weaponSel.addEventListener('change', () => { v0Overridden = false; recompute(); });
    bulletSel.addEventListener('change', () => { v0Overridden = false; recompute(); });
    v0Input.addEventListener('input', () => { v0Overridden = true; render(); });
    sightInput.addEventListener('input', render);
    zeroInput.addEventListener('input', render);

    recompute();
})();
