SAUDI ARABIA FOUR-PRODUCT PIXEL EXPLORER
========================================

This folder is a static ArcGIS Maps SDK for JavaScript application. After the
four multidimensional imagery services are published, config.json contains the
stable Web Map and imagery-service identifiers.

The explorer does not require a multidimensional transpose. For the current
tiled services it queries the selected date range with parallel one-slice
identify requests. If ArcGIS later reports that a transpose is available, the
same app automatically uses the faster one-request method. The 90-day range is
the default for responsive public demonstrations; 1-year, full-record, and
custom ranges remain available.

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

Publish/share the Experience, Web Map, four imagery services, and hosted static
application consistently. The publisher never changes sharing automatically.
