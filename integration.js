// Saudi EMIT candidate replacement; keeps the existing 1.2.2 comparison controls.
const PLUME_ROOT = new URL("plumes/", window.location.href);
const CATALOG_URL = new URL("data/plume_catalog.json", PLUME_ROOT);
const COLORS = { CH4: [189, 59, 143], NH3: [205, 137, 30], NO2: [122, 82, 165], CO: [36, 128, 107] };
const LABELS = { CH4: "CH₄", NH3: "NH₃", NO2: "NO₂", CO: "CO" };
const ui = {
  map: document.getElementById("mapView"), toggle: document.getElementById("plumeCompareToggle"),
  count: document.getElementById("plumeCount"), panel: document.getElementById("plumeComparePanel"),
  close: document.getElementById("plumePanelClose"), gas: document.getElementById("plumeGasFilter"),
  event: document.getElementById("plumeEventSelect"), markers: document.getElementById("plumeShowMarkers"),
  match: document.getElementById("plumeMatchS5P"), opacity: document.getElementById("plumeOpacity"),
  opacityValue: document.getElementById("plumeOpacityValue"), details: document.getElementById("plumeDetails"),
  clear: document.getElementById("plumeClear"), legend: document.getElementById("plumeCompareLegend"),
};
const state = {
  records: [], filtered: [], selected: null, selectionVersion: 0, matchChain: Promise.resolve(),
  Graphic: null, GraphicsLayer: null, MediaLayer: null, ImageElement: null,
  Extent: null, ExtentAndRotationGeoreference: null,
  markerLayer: null, selectionLayer: null, overlayLayer: null,
};
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function numberText(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Unavailable";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}
function rateText(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? "Unavailable" : `${numberText(value)} kg/h`;
}
function markerSymbol(gas) {
  return { type: "simple-marker", style: "circle", size: gas === "CH4" ? 9 : 8,
    color: [...COLORS[gas], 0.9], outline: { color: [255, 255, 255, 0.95], width: 1 } };
}
function openPanel(open = true) {
  ui.panel.hidden = !open;
  ui.toggle.setAttribute("aria-expanded", String(open));
  ui.toggle.classList.toggle("active", open);
}
function populateEvents() {
  state.filtered = state.records.filter(record => ui.gas.value === "ALL" || record.gas === ui.gas.value);
  ui.event.innerHTML = '<option value="">Select a candidate…</option>';
  for (const record of state.filtered) {
    const option = document.createElement("option");
    option.value = record.plume_id;
    option.textContent = `${record.date} · ${LABELS[record.gas]} · ${record.region_name_en || "Saudi Arabia"} · C${record.candidate_number}`;
    option.title = `${record.scene_id} · original candidate ${record.candidate_number}`;
    ui.event.append(option);
  }
  ui.count.textContent = `${state.filtered.length.toLocaleString()} candidates`;
  renderMarkers();
  if (state.selected && !state.filtered.some(record => record.plume_id === state.selected.plume_id)) clearSelection();
}
function renderMarkers() {
  if (!state.markerLayer || !state.Graphic) return;
  state.markerLayer.removeAll();
  state.markerLayer.visible = ui.markers.checked;
  state.markerLayer.addMany(state.filtered.map(record => new state.Graphic({
    geometry: { type: "point", longitude: record.longitude, latitude: record.latitude, spatialReference: { wkid: 4326 } },
    symbol: markerSymbol(record.gas), attributes: { plume_id: record.plume_id, gas: record.gas },
  })));
}
function renderDetails(record, matchResult = null) {
  let note = record.gas === "NH3"
    ? "NH₃ is shown with the current Sentinel-5P parameter for spatial context."
    : `Compare with Sentinel-5P ${LABELS[record.gas]}.`;
  if (matchResult?.selectedDate) note += ` Nearest available map date: ${matchResult.selectedDate}.`;
  const hasRate = record.gas === "CH4" && Number.isFinite(record.emission_estimate);
  const status = record.reviewed ? "Visual and spectral support recorded" : "Screened candidate";
  ui.details.innerHTML = `
    <strong>${escapeHtml(LABELS[record.gas])} · ${escapeHtml(record.observed_at.replace("T", " ").replace("Z", " UTC"))}</strong>
    <span>${escapeHtml(record.region_name_en || "Saudi Arabia")} · candidate ${escapeHtml(record.candidate_number)}</span>
    <span>${escapeHtml(status)}</span>
    <dl>
      <div><dt>${hasRate ? "Preliminary rate" : "Emission rate"}</dt><dd>${escapeHtml(rateText(record.emission_estimate))}</dd></div>
      <div><dt>Conditional σ</dt><dd>${record.emission_uncertainty == null ? "Unavailable" : escapeHtml(rateText(record.emission_uncertainty))}</dd></div>
    </dl>
    <small>${hasRate ? "Estimate applies to this candidate mask; total uncertainty is unavailable." : "Quantitative retrieval pending; no kg/h value assigned."}</small>
    <small>${escapeHtml(note)}</small>`;
}
function renderLegend() {
  if (!state.selected) { ui.legend.hidden = true; return; }
  const record = state.selected;
  const color = `rgb(${COLORS[record.gas].join(",")})`;
  ui.legend.hidden = false;
  ui.legend.innerHTML = `<strong>${escapeHtml(LABELS[record.gas])} candidate footprint</strong>
    <div class="plume-source-ramp" style="background:${color}"></div>
    <div class="plume-legend-values"><span>Candidate</span><span>Transparent: outside mask</span></div>
    <small>Footprint extent · colors identify the gas, not concentration or kg/h.</small>`;
}
function removeOverlay() {
  if (!state.overlayLayer) return;
  ui.map.map.remove(state.overlayLayer);
  state.overlayLayer.destroy();
  state.overlayLayer = null;
}
function updateOverlay() {
  if (!state.selected || !state.MediaLayer) return;
  removeOverlay();
  const asset = state.selected.assets.plume;
  const b = asset.bounds;
  const extent = new state.Extent({ xmin: b[0], ymin: b[1], xmax: b[2], ymax: b[3], spatialReference: { wkid: 4326 } });
  const image = new state.ImageElement({ image: new URL(asset.url, PLUME_ROOT).href,
    georeference: new state.ExtentAndRotationGeoreference({ extent }) });
  state.overlayLayer = new state.MediaLayer({ id: "saudi-emit-selected-footprint",
    title: `${LABELS[state.selected.gas]} candidate · ${state.selected.date}`,
    source: [image], opacity: Number(ui.opacity.value) / 100, listMode: "show" });
  ui.map.map.add(state.overlayLayer);
  ui.map.map.reorder(state.markerLayer, ui.map.map.layers.length - 1);
  ui.map.map.reorder(state.selectionLayer, ui.map.map.layers.length - 1);
  renderLegend();
}
async function selectRecord(plumeId, navigate = true) {
  const record = state.records.find(candidate => candidate.plume_id === plumeId);
  if (!record) return;
  const version = ++state.selectionVersion;
  state.selected = record;
  ui.event.value = state.filtered.some(candidate => candidate.plume_id === plumeId) ? plumeId : "";
  state.selectionLayer.removeAll();
  state.selectionLayer.add(new state.Graphic({
    geometry: { type: "point", longitude: record.longitude, latitude: record.latitude, spatialReference: { wkid: 4326 } },
    symbol: { type: "simple-marker", size: 15, color: [255, 255, 255, 0.12], outline: { color: [7, 82, 71, 1], width: 3 } },
  }));
  updateOverlay(); renderDetails(record); openPanel(true);
  if (navigate) {
    const b = record.assets.plume.bounds;
    await ui.map.view.goTo({ target: new state.Extent({ xmin: b[0], ymin: b[1], xmax: b[2], ymax: b[3],
      spatialReference: { wkid: 4326 } }) }, { duration: 650 }).catch(() => {});
  }
  if (version !== state.selectionVersion) return;
  if (ui.match.checked && window.saudiAtmosphereExplorer?.matchPlume) {
    state.matchChain = state.matchChain.catch(() => {}).then(async () => {
      if (version !== state.selectionVersion) return null;
      return window.saudiAtmosphereExplorer.matchPlume(record, true);
    });
    try {
      const matched = await state.matchChain;
      if (version === state.selectionVersion) renderDetails(record, matched);
    } catch (error) {
      console.error(error);
      if (version === state.selectionVersion) renderDetails(record);
    }
  }
}
function clearSelection() {
  ++state.selectionVersion;
  state.selected = null; ui.event.value = "";
  state.selectionLayer?.removeAll(); removeOverlay(); ui.legend.hidden = true;
  ui.details.textContent = "Choose a candidate to overlay its footprint on Sentinel-5P.";
}
function bindControls() {
  ui.toggle.addEventListener("click", () => openPanel(ui.panel.hidden));
  ui.close.addEventListener("click", () => openPanel(false));
  ui.gas.addEventListener("change", populateEvents);
  ui.event.addEventListener("change", () => ui.event.value ? selectRecord(ui.event.value, true) : clearSelection());
  ui.markers.addEventListener("change", () => { if (state.markerLayer) state.markerLayer.visible = ui.markers.checked; });
  ui.match.addEventListener("change", () => { if (ui.match.checked && state.selected) selectRecord(state.selected.plume_id, false); });
  ui.opacity.addEventListener("input", () => {
    ui.opacityValue.value = `${ui.opacity.value}%`;
    if (state.overlayLayer) state.overlayLayer.opacity = Number(ui.opacity.value) / 100;
  });
  ui.clear.addEventListener("click", clearSelection);
}
async function initializeComparison() {
  bindControls();
  try {
    const response = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Candidate catalogue request failed: HTTP ${response.status}`);
    const catalog = await response.json();
    state.records = catalog.records || [];
    if (state.records.some(r => !COLORS[r.gas])) throw new Error("Unexpected gas in candidate catalogue.");
    if (window.saudiAtmosphereExplorerReady) await window.saudiAtmosphereExplorerReady;
    await ui.map.viewOnReady();
    const [Graphic, GraphicsLayer, MediaLayer, ImageElement, Extent, ExtentAndRotationGeoreference] = await Promise.all([
      $arcgis.import("@arcgis/core/Graphic.js"), $arcgis.import("@arcgis/core/layers/GraphicsLayer.js"),
      $arcgis.import("@arcgis/core/layers/MediaLayer.js"), $arcgis.import("@arcgis/core/layers/support/ImageElement.js"),
      $arcgis.import("@arcgis/core/geometry/Extent.js"), $arcgis.import("@arcgis/core/layers/support/ExtentAndRotationGeoreference.js"),
    ]);
    Object.assign(state, { Graphic, GraphicsLayer, MediaLayer, ImageElement, Extent, ExtentAndRotationGeoreference });
    state.markerLayer = new GraphicsLayer({ id: "saudi-emit-candidate-markers", title: "EMIT trace-gas candidates", visible: true });
    state.selectionLayer = new GraphicsLayer({ id: "saudi-emit-candidate-selection", title: "Selected EMIT candidate", listMode: "hide" });
    ui.map.map.addMany([state.markerLayer, state.selectionLayer]); populateEvents();
    ui.map.addEventListener("arcgisViewClick", async event => {
      if (!state.markerLayer.visible) return;
      const d = event.detail || {};
      let point = Number.isFinite(d.x) && Number.isFinite(d.y) ? { x: d.x, y: d.y } : null;
      if (!point && d.mapPoint) point = ui.map.view.toScreen(d.mapPoint);
      if (!point) return;
      const hitTest = await ui.map.view.hitTest(point, { include: state.markerLayer });
      const hit = hitTest.results.find(result => result.graphic?.attributes?.plume_id);
      if (hit) selectRecord(hit.graphic.attributes.plume_id, false);
    });
  } catch (error) {
    console.error(error); ui.count.textContent = "Unavailable";
    ui.details.textContent = error.message || String(error); ui.toggle.disabled = true;
  }
}
initializeComparison();
