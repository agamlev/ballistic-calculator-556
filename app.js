(function () {
    'use strict';

    const D = window.BALLISTIC_DATA;
    const $ = (id) => document.getElementById(id);
    const SVG_NS = 'http://www.w3.org/2000/svg';

    // ── Inject M4A1 10" derived from M4A1 14.5" by velocity scaling. ──
    //   k = v_new/v_old → vel·k, time/k, drop/k², energy·k²
    (function addM4A1_10() {
        const srcIdx = D.weapons.indexOf('M4A1 - קנה 14.5"');
        if (srcIdx < 0) return;
        const srcMat = D.matrix[srcIdx];
        const newName = 'M4A1 - קנה 10"';
        if (D.weapons.includes(newName)) return;

        const newMat = {};
        for (const bIdx in srcMat) {
            const src = srcMat[bIdx];
            const v0_old = src.vel[0];
            const v0_new = Math.max(v0_old - 4.5 * 9, 1);
            const k  = v0_new / v0_old;
            const k2 = k * k;
            newMat[bIdx] = {
                drop:   src.drop.map(d => d / k2),
                vel:    src.vel.map(v => v * k),
                time:   src.time.map(t => t / k),
                energy: src.energy.map(e => e * k2),
            };
        }
        const insertAt = srcIdx + 1;
        D.weapons.splice(insertAt, 0, newName);
        D.weapon_barrel[newName] = 10.0;
        const oldMatrix = D.matrix;
        const rebuilt = {};
        for (let i = 0; i < D.weapons.length; i++) {
            if (i < insertAt) rebuilt[i] = oldMatrix[i];
            else if (i === insertAt) rebuilt[i] = newMat;
            else rebuilt[i] = oldMatrix[i - 1];
        }
        D.matrix = rebuilt;
    })();

    // ── DOM refs ──
    const loadoutsEl  = $('loadouts');
    const addBtn      = $('add-loadout');
    const chartRange  = $('chart-range');
    const chartSvg    = $('chart');
    const tooltipEl   = $('chart-tooltip');
    const legendEl    = $('legend');
    const tbody       = $('ballistic-tbody');
    const statBc      = $('stat-bc');
    const statMass    = $('stat-mass');
    const statBarrel  = $('stat-barrel');
    const statV0      = $('stat-v0');

    // ── Palette: max 4 loadouts. ──
    const PALETTE = [
        { id: 'A', color: '#ff9b3a' },
        { id: 'B', color: '#33b6ff' },
        { id: 'C', color: '#9d7bff' },
        { id: 'D', color: '#4ade80' },
    ];

    const DEFAULTS = {
        weapon: D.weapons.indexOf('M4A1 - קנה 14.5"'),
        bullet: 1,           // M855 SS109
        sight:  44,
        zero:   100,
    };

    // ── Loadout state ──
    /** @type {Array<{id:string,color:string,weapon:number,bullet:number,sight:number,zero:number,v0:number,v0Overridden:boolean,row:HTMLElement}>} */
    const loadouts = [];

    function nextSlot() {
        const used = new Set(loadouts.map(l => l.id));
        return PALETTE.find(p => !used.has(p.id));
    }

    function addLoadout(seed) {
        const slot = nextSlot();
        if (!slot) return;

        const base = seed || (loadouts[loadouts.length - 1]) || DEFAULTS;
        const weapon = base.weapon ?? DEFAULTS.weapon;
        const bullet = base.bullet ?? DEFAULTS.bullet;
        const combo  = D.matrix[weapon][bullet];

        const lo = {
            id: slot.id,
            color: slot.color,
            weapon,
            bullet,
            sight: base.sight ?? DEFAULTS.sight,
            zero:  base.zero  ?? DEFAULTS.zero,
            v0:    Math.round(base.v0 ?? combo.vel[0]),
            v0Overridden: !!base.v0Overridden,
            row: null,
        };
        loadouts.push(lo);
        buildRow(lo);
        refreshAll();
    }

    function removeLoadout(id) {
        const idx = loadouts.findIndex(l => l.id === id);
        if (idx < 0 || loadouts.length <= 1) return;
        loadouts[idx].row.remove();
        loadouts.splice(idx, 1);
        refreshAll();
    }

    function buildRow(lo) {
        const row = document.createElement('div');
        row.className = 'loadout-row';
        row.dataset.id = lo.id;
        row.style.setProperty('--swatch', lo.color);

        row.innerHTML =
            '<div class="lo-meta">' +
                '<span class="lo-swatch"></span>' +
                '<span class="lo-tag">' + lo.id + '</span>' +
            '</div>' +
            '<label class="ctrl">' +
                '<span class="ctrl-k">נשק / קנה</span>' +
                '<select class="ctrl-v lo-weapon"></select>' +
            '</label>' +
            '<label class="ctrl">' +
                '<span class="ctrl-k">תחמושת</span>' +
                '<select class="ctrl-v lo-bullet"></select>' +
            '</label>' +
            '<label class="ctrl">' +
                '<span class="ctrl-k">כוונת (mm)</span>' +
                '<input type="number" class="ctrl-v lo-sight" step="1" min="0">' +
            '</label>' +
            '<label class="ctrl">' +
                '<span class="ctrl-k">אפס (מ\')</span>' +
                '<input type="number" class="ctrl-v lo-zero" step="25" min="25">' +
            '</label>' +
            '<label class="ctrl">' +
                '<span class="ctrl-k">V₀ (m/s)</span>' +
                '<input type="number" class="ctrl-v lo-v0" step="1" min="0">' +
            '</label>' +
            '<button type="button" class="lo-del" title="הסר">✕</button>';

        const wSel  = row.querySelector('.lo-weapon');
        const bSel  = row.querySelector('.lo-bullet');
        const sInp  = row.querySelector('.lo-sight');
        const zInp  = row.querySelector('.lo-zero');
        const v0Inp = row.querySelector('.lo-v0');
        const del   = row.querySelector('.lo-del');

        D.weapons.forEach((w, i) => {
            const o = document.createElement('option');
            o.value = i; o.textContent = w;
            wSel.appendChild(o);
        });
        D.bullets.forEach((b, i) => {
            const o = document.createElement('option');
            o.value = i; o.textContent = b;
            bSel.appendChild(o);
        });

        wSel.value  = lo.weapon;
        bSel.value  = lo.bullet;
        sInp.value  = lo.sight;
        zInp.value  = lo.zero;
        v0Inp.value = lo.v0;

        wSel.addEventListener('change', () => {
            lo.weapon = parseInt(wSel.value, 10);
            lo.v0Overridden = false;
            lo.v0 = Math.round(D.matrix[lo.weapon][lo.bullet].vel[0]);
            v0Inp.value = lo.v0;
            refreshAll();
        });
        bSel.addEventListener('change', () => {
            lo.bullet = parseInt(bSel.value, 10);
            lo.v0Overridden = false;
            lo.v0 = Math.round(D.matrix[lo.weapon][lo.bullet].vel[0]);
            v0Inp.value = lo.v0;
            refreshAll();
        });
        sInp.addEventListener('input', () => {
            lo.sight = parseFloat(sInp.value) || 0;
            refreshAll();
        });
        zInp.addEventListener('input', () => {
            lo.zero = Math.max(parseFloat(zInp.value) || 1, 1);
            refreshAll();
        });
        v0Inp.addEventListener('input', () => {
            lo.v0 = parseFloat(v0Inp.value) || D.matrix[lo.weapon][lo.bullet].vel[0];
            lo.v0Overridden = true;
            refreshAll();
        });
        del.addEventListener('click', () => removeLoadout(lo.id));

        loadoutsEl.appendChild(row);
        lo.row = row;
    }

    addBtn.addEventListener('click', () => addLoadout());
    chartRange.addEventListener('change', refreshAll);

    // ── Compute ──
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

    function computeSeries(lo) {
        const combo = D.matrix[lo.weapon][lo.bullet];
        const ranges = D.ranges;
        const sightCm = (lo.sight || 0) / 10;
        const zeroDist = Math.max(lo.zero || 1, 1);
        const dropAtZero = interp(ranges, combo.drop, zeroDist);

        const baseV0 = combo.vel[0];
        const userV0 = lo.v0Overridden ? (lo.v0 || baseV0) : baseV0;
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
        return { rows, sightCm, zeroDist, dropAtZero, v0: userV0 };
    }

    function fmt(v, decimals) {
        if (!isFinite(v)) return '—';
        return Number(v.toFixed(decimals)).toString();
    }

    function pathClass(cm) {
        if (Math.abs(cm) < 0.05) return 'path-zero';
        return cm > 0 ? 'path-positive' : 'path-negative';
    }

    // ── Table (primary loadout) ──
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

    function renderStats(lo, series) {
        const meta = D.bullet_meta[D.bullets[lo.bullet]];
        const wName = D.weapons[lo.weapon];
        statBc.textContent     = meta.bc_g1.toFixed(3);
        statMass.textContent   = meta.mass_gr.toFixed(0);
        statBarrel.textContent = D.weapon_barrel[wName].toFixed(1) + '"';
        statV0.textContent     = Math.round(series.v0);
    }

    // ── Chart ──
    function el(name, attrs, text) {
        const e = document.createElementNS(SVG_NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (text != null) e.textContent = text;
        return e;
    }

    function niceStep(rough) {
        const pow = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / pow;
        if (norm < 1.5) return 1 * pow;
        if (norm < 3)   return 2 * pow;
        if (norm < 7)   return 5 * pow;
        return 10 * pow;
    }

    function niceTicks(min, max, target) {
        const step = niceStep((max - min) / target);
        const start = Math.ceil(min / step) * step;
        const ticks = [];
        for (let v = start; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
        return ticks;
    }

    /** Compute stable y-bounds: snap to a nice step so small changes don't move the axis. */
    function stableBounds(yMin, yMax) {
        const raw = yMax - yMin;
        const pad = Math.max(raw * 0.08, 0.5);
        const lo  = yMin - pad;
        const hi  = yMax + pad;
        const step = niceStep((hi - lo) / 6);
        return {
            yLo: Math.floor(lo / step) * step,
            yHi: Math.ceil(hi  / step) * step,
            step,
        };
    }

    function renderChart(items, maxR) {
        // items: [{lo, series, pts}]
        // pts already clipped to [0, maxR]
        const allY = [0];
        for (const it of items) {
            for (const p of it.pts) allY.push(p.y);
            allY.push(-it.series.sightCm);
        }
        const yMin = Math.min(...allY);
        const yMax = Math.max(...allY);
        const { yLo, yHi } = stableBounds(yMin, yMax);

        const W = 800, H = 360;
        const PAD_L = 50, PAD_R = 18, PAD_T = 18, PAD_B = 36;
        const plotW = W - PAD_L - PAD_R;
        const plotH = H - PAD_T - PAD_B;
        const sx = x => PAD_L + (x / maxR) * plotW;
        const sy = y => PAD_T + (1 - (y - yLo) / (yHi - yLo)) * plotH;

        chartSvg.innerHTML = '';

        chartSvg.appendChild(el('rect', {
            x: PAD_L, y: PAD_T, width: plotW, height: plotH,
            fill: '#0d0d0d', stroke: '#2a2a2a', 'stroke-width': '1'
        }));

        const xTicks = niceTicks(0, maxR, 8);
        const yTicks = niceTicks(yLo, yHi, 6);
        const grid = el('g', { stroke: '#222', 'stroke-width': '1' });
        for (const xt of xTicks) {
            grid.appendChild(el('line', { x1: sx(xt), y1: PAD_T, x2: sx(xt), y2: PAD_T + plotH, 'stroke-dasharray': '2,4', opacity: '0.8' }));
        }
        for (const yt of yTicks) {
            grid.appendChild(el('line', { x1: PAD_L, y1: sy(yt), x2: PAD_L + plotW, y2: sy(yt), 'stroke-dasharray': '2,4', opacity: '0.8' }));
        }
        chartSvg.appendChild(grid);

        const labels = el('g', { fill: '#9a9a9a', 'font-size': '12', 'font-family': 'Menlo, Consolas, monospace' });
        for (const xt of xTicks) {
            labels.appendChild(el('text', { x: sx(xt), y: PAD_T + plotH + 18, 'text-anchor': 'middle' }, String(xt)));
        }
        const yFmt = (yHi - yLo) < 5 ? 1 : 0;
        for (const yt of yTicks) {
            labels.appendChild(el('text', { x: PAD_L - 6, y: sy(yt) + 4, 'text-anchor': 'end' }, yt.toFixed(yFmt)));
        }
        labels.appendChild(el('text', {
            x: PAD_L + plotW / 2, y: H - 4,
            'text-anchor': 'middle', fill: '#cfcfcf', 'font-size': '12', 'font-family': 'Heebo, Arial, sans-serif'
        }, "מרחק (מ')"));
        labels.appendChild(el('text', {
            x: 14, y: PAD_T + plotH / 2,
            'text-anchor': 'middle', fill: '#cfcfcf', 'font-size': '12', 'font-family': 'Heebo, Arial, sans-serif',
            transform: 'rotate(-90, 14, ' + (PAD_T + plotH / 2) + ')'
        }, 'מסלול (ס"מ)'));
        chartSvg.appendChild(labels);

        if (yLo <= 0 && yHi >= 0) {
            chartSvg.appendChild(el('line', {
                x1: PAD_L, y1: sy(0), x2: PAD_L + plotW, y2: sy(0),
                stroke: '#6a6a6a', 'stroke-width': '1.2', 'stroke-dasharray': '6,4'
            }));
        }

        // Trajectory paths (back to front, primary on top)
        for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            let d = '';
            for (let j = 0; j < it.pts.length; j++) {
                d += (j === 0 ? 'M' : 'L') + sx(it.pts[j].x).toFixed(2) + ',' + sy(it.pts[j].y).toFixed(2);
            }
            chartSvg.appendChild(el('path', {
                d, fill: 'none', stroke: it.lo.color, 'stroke-width': '2.6',
                'stroke-linejoin': 'round', 'stroke-linecap': 'round'
            }));
        }

        // Zero markers
        for (const it of items) {
            if (it.series.zeroDist <= maxR) {
                chartSvg.appendChild(el('circle', {
                    cx: sx(it.series.zeroDist), cy: sy(0),
                    r: '5', fill: it.lo.color, stroke: '#ffd84a', 'stroke-width': '1.8'
                }));
            }
        }

        // Hover targets — primary loadout only
        if (items.length > 0) {
            const primary = items[0];
            const hoverG = el('g', {});
            for (const p of primary.pts) {
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

            for (const it of items) {
                for (const p of it.pts) {
                    chartSvg.appendChild(el('circle', {
                        cx: sx(p.x), cy: sy(p.y), r: '2.4',
                        fill: it.lo.color, stroke: '#111', 'stroke-width': '0.7'
                    }));
                }
            }
        }
    }

    function onHover(e) {
        const t = e.currentTarget;
        const x = parseFloat(t.getAttribute('data-x'));
        const y = parseFloat(t.getAttribute('data-y'));
        const rect = chartSvg.getBoundingClientRect();
        tooltipEl.hidden = false;
        tooltipEl.innerHTML = "מרחק: " + fmt(x, 0) + " מ'<br>מסלול (A): " + fmt(y, 2) + ' ס"מ';
        const cx = e.clientX - rect.left + chartSvg.parentElement.scrollLeft;
        const cy = e.clientY - rect.top;
        tooltipEl.style.left = cx + 'px';
        tooltipEl.style.top  = cy + 'px';
    }
    function onLeave() { tooltipEl.hidden = true; }

    function renderLegend(items) {
        const parts = items.map(it => {
            const wName = D.weapons[it.lo.weapon];
            const bName = D.bullets[it.lo.bullet];
            return '<span class="lg" style="color:' + it.lo.color + '">' +
                   '■ ' + it.lo.id + ' · ' + wName + ' + ' + bName +
                   ' · אפס ' + it.lo.zero + 'מ\'</span>';
        });
        parts.push('<span class="lg lg-los">- - LOS</span>');
        parts.push('<span class="lg lg-zero">● נקודת אפס</span>');
        legendEl.innerHTML = parts.join('');
    }

    function refreshDelButtons() {
        const onlyOne = loadouts.length <= 1;
        const canAdd  = loadouts.length < PALETTE.length;
        for (const lo of loadouts) {
            const del = lo.row.querySelector('.lo-del');
            del.classList.toggle('hidden', onlyOne);
        }
        addBtn.disabled = !canAdd;
    }

    function refreshAll() {
        const maxR = parseFloat(chartRange.value);
        const items = loadouts.map(lo => {
            const series = computeSeries(lo);
            const pts = [];
            for (const r of series.rows) {
                if (r.r <= maxR) pts.push({ x: r.r, y: r.path });
            }
            if (pts.length === 0 || pts[pts.length - 1].x < maxR) {
                const ranges = D.ranges;
                const paths  = series.rows.map(r => r.path);
                pts.push({ x: maxR, y: interp(ranges, paths, maxR) });
            }
            return { lo, series, pts };
        });

        renderChart(items, maxR);
        renderLegend(items);
        if (items.length > 0) {
            renderTable(items[0].series);
            renderStats(items[0].lo, items[0].series);
        }
        refreshDelButtons();
    }

    // ── Init ──
    addLoadout(DEFAULTS);
})();
