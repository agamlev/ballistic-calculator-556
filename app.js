(function () {
    'use strict';

    const D = window.BALLISTIC_DATA;
    const $ = (id) => document.getElementById(id);

    const weaponSel  = $('weapon');
    const bulletSel  = $('bullet');
    const v0Input    = $('v0');
    const bcInput    = $('bc');
    const massInput  = $('mass');
    const sightInput = $('sight');
    const zeroInput  = $('zero');
    const chartRange = $('chart-range');
    const chartSvg   = $('chart');
    const tooltipEl  = $('chart-tooltip');
    const tbody      = $('ballistic-tbody');

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
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function getCombo() {
        const w = parseInt(weaponSel.value, 10);
        const b = parseInt(bulletSel.value, 10);
        return D.matrix[w][b];
    }

    function refreshAuto() {
        const bIdx = parseInt(bulletSel.value, 10);
        const bulletName = D.bullets[bIdx];
        const meta = D.bullet_meta[bulletName];
        const combo = getCombo();

        if (!v0Overridden) {
            v0Input.value = Math.round(combo.vel[0]);
        }
        bcInput.value = meta.bc_g1;
        massInput.value = meta.mass_gr;
    }

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

    // Compute the full series at the table ranges given current sight/zero/v0.
    function computeSeries() {
        const combo = getCombo();
        const ranges = D.ranges;
        const sightMm = parseFloat(sightInput.value) || 0;
        const sightCm = sightMm / 10;
        const zeroDist = Math.max(parseFloat(zeroInput.value) || 0, 1);
        const dropAtZero = interp(ranges, combo.drop, zeroDist);

        const baseV0 = combo.vel[0];
        const userV0 = parseFloat(v0Input.value) || baseV0;
        const velScale = userV0 / baseV0;

        const rows = [];
        for (let i = 0; i < ranges.length; i++) {
            const r = ranges[i];
            const drop   = combo.drop[i];
            const vel    = combo.vel[i] * velScale;
            const time   = combo.time[i];
            const energy = combo.energy[i] * velScale * velScale;
            const path = (r === 0)
                ? -sightCm
                : -sightCm + r * (sightCm + dropAtZero) / zeroDist - drop;
            const moa = r > 0 ? (path * 100) / (2.908 * r) : 0;
            rows.push({ r, drop, vel, time, energy, path, moa });
        }
        return { rows, sightCm, zeroDist, dropAtZero };
    }

    function renderTable(series) {
        tbody.innerHTML = '';
        const frag = document.createDocumentFragment();
        const { rows, zeroDist } = series;
        for (const row of rows) {
            const tr = document.createElement('tr');
            if (Math.abs(row.r - zeroDist) < 0.01) tr.classList.add('zero-row');
            const cls = pathClass(row.path);
            tr.innerHTML =
                '<td>' + fmt(row.r, 0) + '</td>' +
                '<td class="' + cls + '">' + fmt(row.path, 2) + '</td>' +
                '<td class="' + cls + '">' + fmt(row.moa, 2) + '</td>' +
                '<td>' + fmt(row.time, 4) + '</td>' +
                '<td>' + fmt(row.vel, 1) + '</td>' +
                '<td>' + fmt(row.energy, 0) + '</td>' +
                '<td>' + fmt(row.drop, 2) + '</td>';
            frag.appendChild(tr);
        }
        tbody.appendChild(frag);
    }

    // ------- SVG chart -------
    function el(name, attrs, text) {
        const e = document.createElementNS(SVG_NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (text != null) e.textContent = text;
        return e;
    }

    function niceTicks(min, max, target) {
        const range = max - min;
        const rough = range / target;
        const pow = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / pow;
        let step;
        if (norm < 1.5) step = 1;
        else if (norm < 3) step = 2;
        else if (norm < 7) step = 5;
        else step = 10;
        step *= pow;
        const start = Math.ceil(min / step) * step;
        const ticks = [];
        for (let v = start; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
        return ticks;
    }

    function renderChart(series) {
        const maxR = parseFloat(chartRange.value);
        // Subset of series within [0, maxR], plus an interpolated endpoint at exactly maxR.
        const pts = series.rows.filter(r => r.r <= maxR).map(r => ({ x: r.r, y: r.path }));
        if (pts.length === 0 || pts[pts.length - 1].x < maxR) {
            // interpolate endpoint
            const ranges = D.ranges;
            const paths = series.rows.map(r => r.path);
            const yEnd = interp(ranges, paths, maxR);
            pts.push({ x: maxR, y: yEnd });
        }

        // y range with padding
        const ys = pts.map(p => p.y).concat([0, -series.sightCm]); // ensure LOS visible
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);
        const yPad = Math.max((yMax - yMin) * 0.1, 1);
        const yLo = yMin - yPad;
        const yHi = yMax + yPad;

        const W = 800, H = 360;
        const PAD_L = 50, PAD_R = 18, PAD_T = 18, PAD_B = 36;
        const plotW = W - PAD_L - PAD_R;
        const plotH = H - PAD_T - PAD_B;
        const sx = x => PAD_L + (x / maxR) * plotW;
        const sy = y => PAD_T + (1 - (y - yLo) / (yHi - yLo)) * plotH;

        chartSvg.innerHTML = '';

        // Gridlines + ticks
        const xTicks = niceTicks(0, maxR, 8);
        const yTicks = niceTicks(yLo, yHi, 6);
        const grid = el('g', { 'stroke': '#3a445e', 'stroke-width': '1' });
        for (const xt of xTicks) {
            grid.appendChild(el('line', { x1: sx(xt), y1: PAD_T, x2: sx(xt), y2: PAD_T + plotH, 'stroke-dasharray': '2,3', 'opacity': '0.5' }));
        }
        for (const yt of yTicks) {
            grid.appendChild(el('line', { x1: PAD_L, y1: sy(yt), x2: PAD_L + plotW, y2: sy(yt), 'stroke-dasharray': '2,3', 'opacity': '0.5' }));
        }
        chartSvg.appendChild(grid);

        // Axes labels (RTL: bigger X on the left)
        const labels = el('g', { 'fill': '#aab5c7', 'font-size': '11', 'font-family': 'inherit' });
        for (const xt of xTicks) {
            labels.appendChild(el('text', { x: sx(xt), y: PAD_T + plotH + 16, 'text-anchor': 'middle' }, String(xt)));
        }
        for (const yt of yTicks) {
            labels.appendChild(el('text', { x: PAD_L - 6, y: sy(yt) + 4, 'text-anchor': 'end' }, yt.toFixed(yHi - yLo < 5 ? 1 : 0)));
        }
        labels.appendChild(el('text', { x: PAD_L + plotW / 2, y: H - 6, 'text-anchor': 'middle', 'fill': '#d3dbeb' }, "מרחק (מ')"));
        labels.appendChild(el('text', {
            x: 14, y: PAD_T + plotH / 2,
            'text-anchor': 'middle', 'fill': '#d3dbeb',
            transform: 'rotate(-90, 14, ' + (PAD_T + plotH / 2) + ')'
        }, 'מסלול קליע (ס"מ)'));
        chartSvg.appendChild(labels);

        // Zero line (LOS = y=0)
        if (yLo <= 0 && yHi >= 0) {
            chartSvg.appendChild(el('line', {
                x1: PAD_L, y1: sy(0), x2: PAD_L + plotW, y2: sy(0),
                stroke: '#9aa6bd', 'stroke-width': '1.2', 'stroke-dasharray': '6,4'
            }));
        }

        // Trajectory path
        let d = '';
        for (let i = 0; i < pts.length; i++) {
            d += (i === 0 ? 'M' : 'L') + sx(pts[i].x).toFixed(2) + ',' + sy(pts[i].y).toFixed(2);
        }
        chartSvg.appendChild(el('path', {
            d, fill: 'none', stroke: '#f5a623', 'stroke-width': '2.4',
            'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }));

        // Zero point (yellow dot) if within view
        if (series.zeroDist <= maxR) {
            chartSvg.appendChild(el('circle', {
                cx: sx(series.zeroDist), cy: sy(0),
                r: '5', fill: '#f5d061', stroke: '#1a1f2e', 'stroke-width': '2'
            }));
        }

        // Sample dots for hover targets
        const hoverG = el('g', {});
        for (const p of pts) {
            const c = el('circle', {
                cx: sx(p.x), cy: sy(p.y), r: '8',
                fill: 'transparent', stroke: 'transparent',
                'data-x': p.x, 'data-y': p.y
            });
            c.style.cursor = 'crosshair';
            c.addEventListener('mousemove', onHover);
            c.addEventListener('mouseleave', onLeave);
            hoverG.appendChild(c);
        }
        chartSvg.appendChild(hoverG);

        // Small visible dots
        for (const p of pts) {
            chartSvg.appendChild(el('circle', {
                cx: sx(p.x), cy: sy(p.y), r: '2.5',
                fill: '#f5a623', stroke: '#1a1f2e', 'stroke-width': '0.8'
            }));
        }
    }

    function onHover(e) {
        const t = e.currentTarget;
        const x = parseFloat(t.getAttribute('data-x'));
        const y = parseFloat(t.getAttribute('data-y'));
        const rect = chartSvg.getBoundingClientRect();
        tooltipEl.hidden = false;
        tooltipEl.innerHTML = "מרחק: " + fmt(x, 0) + " מ'<br>מסלול: " + fmt(y, 2) + ' ס"מ';
        const cx = e.clientX - rect.left + chartSvg.parentElement.scrollLeft;
        const cy = e.clientY - rect.top;
        tooltipEl.style.left = cx + 'px';
        tooltipEl.style.top  = cy + 'px';
    }
    function onLeave() {
        tooltipEl.hidden = true;
    }

    function recompute() {
        refreshAuto();
        const s = computeSeries();
        renderTable(s);
        renderChart(s);
    }

    function renderOnly() {
        const s = computeSeries();
        renderTable(s);
        renderChart(s);
    }

    weaponSel.addEventListener('change', () => { v0Overridden = false; recompute(); });
    bulletSel.addEventListener('change', () => { v0Overridden = false; recompute(); });
    v0Input.addEventListener('input', () => { v0Overridden = true; renderOnly(); });
    sightInput.addEventListener('input', renderOnly);
    zeroInput.addEventListener('input', renderOnly);
    chartRange.addEventListener('change', renderOnly);

    recompute();
})();
