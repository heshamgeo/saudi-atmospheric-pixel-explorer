SAUDI ARABIA MULTIRESOLUTION PIXEL EXPLORER
============================================

This folder is a static ArcGIS Maps SDK for JavaScript application. After the
daily, 10-day, and monthly multidimensional imagery services are published,
config.json contains their stable Web Map and imagery-service identifiers.

The application provides separate Parameter and Time product selectors. Daily
loads the existing services. 10-Day and Monthly load the new aggregate cubes.
Each selection updates the map, date slider, clickable pixel chart, and CSV.

The explorer does not require a multidimensional transpose. It queries the
selected date range with parallel one-slice identify requests when a transpose
is absent. If ArcGIS reports a transpose, the same app automatically uses the
faster one-request method. The default chart range remains 90 days; 1-year,
full-record, and custom ranges remain available.

Each imagery item is loaded directly from its stable ArcGIS item ID. This is
intentional: the explorer remains usable even if a programmatically inserted
copy of the layer in the Web Map has an incorrect display definition.

For local preview, run preview_clickable_pixel_explorer.bat. ArcGIS credentials
are not stored in this folder. Private ArcGIS items require the viewer to sign
in.

For ArcGIS Experience Builder, host the generated ZIP as a static HTTPS site,
then add it with the Embed widget. The application supplies the parameter
selector, map date slider, one-click pixel chart, range selector, and CSV
download. Experience Builder continues to provide the surrounding pages,
navigation, text, and branding.

Publish/share the Experience, Web Map, twelve imagery services, and hosted
static application consistently. The publisher never changes sharing
automatically.
