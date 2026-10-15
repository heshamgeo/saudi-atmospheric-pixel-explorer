Saudi EMIT trace-gas demo replacement
120 selected candidates in the current run; actual counts are in integration_manifest.json.
PNG overlays render saved signal TIFF values inside the saved WGS84 footprint.
Native projected grids use nearest-neighbour reprojection; outside-mask and invalid pixels are transparent.
PNG appearance uses a masked Gaussian (sigma 0.6 source-display pixels) and bilinear enlargement of scalar values.
The saved footprint and NoData holes remain unchanged; TIFFs and emission-rate inputs are not smoothed.
NASA methane enhancement is labeled ppm m. Other-gas responses have unvalidated physical units.
Color scales are adjusted per candidate: CH4 zero to the 98th percentile; other responses 2nd to 98th percentile.
Values beyond the displayed range use its endpoint colors; no source TIFF values are altered.
Colors do not represent per-pixel kg/h or ambient concentration.
The selected plume stays above context layers, including newly loaded Sentinel-5P products.
Methane rates are preliminary saved-mask estimates; total uncertainty is unavailable.
Other-gas rates are unavailable pending quantitative retrieval.
Use this replacement script for future plume builds; the legacy CH4/CO2 builder uses the older catalogue.
