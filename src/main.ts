import * as pmtiles from "pmtiles";
import * as maplibregl from "maplibre-gl";
import layers from "protomaps-themes-base";
import   "@mapbox/vector-tile";

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const myMap = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://https://r2-public.protomaps.com/protomaps-sample-datasets/protomaps-basemap-opensource-20230408.pmtiles`,
        attribution: 'Kodjo',
      },
    },
    layers: layers("protomaps",'dark'),
  },
  center: [0, 0],  
  zoom: 0
});

// Throttling
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}
// DEbounce
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

const logCurrentView = throttle(() => {
  const bounds = myMap.getBounds();
  const zoom = Math.floor(myMap.getZoom());
  console.log(`Current view: zoom=${zoom}, bounds=${JSON.stringify(bounds)}`);
}, 1000); 

myMap.on("load", async () => {
  const protocol = await new pmtiles.Protocol();

  const archive =protocol.get("pmtiles://http://localhost:5175/eddy_kinetic_energy.pmtiles");
  const metadata = archive.metadata;
  console.log(archive);

  if (metadata && metadata.vector_layers) {
    metadata.vector_layers.forEach(layer => {
      console.log("Adding layer:", layer.id);

      myMap.addLayer({
        id: layer.id,
        type: "fill",  
        source: "protomaps",  
        "source-layer": layer.id, 
        layout: {},
        paint: {
          "fill-color": "#888888",  
          "fill-opacity": 0.5,
        },
      });
    });
  } else {
    console.error("No vector layers found in the PMTiles metadata.");
  }
  
  const throttledLog = throttle((z, x, y, tileId) => {
    console.log(`Loading tile: z=${z}, x=${x}, y=${y}, tileId=${tileId}`);
  }, 1000);  

  const debouncedGetTile = debounce(async (z, x, y, tileId) => {
    const tileData = await archive.getZxy(z, x, y);
    return { tileData: tileData ? new Uint8Array(tileData) : null, tileId };
  }, 100);  

  const customLoadTile = function(tile, callback) {
    const {z, x, y} = tile.tileID.canonical;
    const tileId = pmtiles.zxyToTileId(z, x, y);
     throttledLog(z, x, y, tileId);

     debouncedGetTile(z, x, y, tileId)
      .then(({ tileData, tileId }) => {
        if (tileData) {
          tile.setData(tileData);
          console.log(`Loaded tile data for tileId: ${tileId}`);
          callback(null);
        } else {
          callback(new Error(`Tile not found for tileId: ${tileId}`));
        }
      })
      .catch(error => {
        console.error(`Error loading tile z=${z}, x=${x}, y=${y}, tileId=${tileId}:`, error);
        callback(error);
      });
  };
  myMap.style.sourceCaches['protomaps']._loadTile = customLoadTile;
});

myMap.on('moveend', logCurrentView);
myMap.on('zoomend', logCurrentView);