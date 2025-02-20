parser = new DOMParser();

var template = {
  'provenance': {
    'image': {
      'slide': 'ID',
    },
    'analysis': {
      'source': 'human',
      'execution_id': 'TEMPLATE',
      'name': 'TEMPLATE',
      'coordinate': 'image',
    },
  },
  'properties': {
    'annotations': {
      'name': 'TEMPLATE',
      'note': 'Converted from XML',
    },
  },
  'geometries': {
    'type': 'FeatureCollection',
  },
};

function xml2geo() {
  let features = [];
  let input = document.getElementById('xml_in').value;
  xmlDoc = parser.parseFromString(input, 'text/xml');
  let regions = xmlDoc.getElementsByTagName('Region');

  for (let i of regions) {
    let regionId = i.getAttribute('Id');
    let regionType = i.getAttribute('Type') || 'Polygon'; // Default to Polygon if Type is missing
    console.log('Processing Region ID:', regionId, 'as', regionType);

    let vertices = i.getElementsByTagName('Vertex');
    let coordinates = [];
    let minX = 99e99; let maxX = 0; let minY = 99e99; let maxY = 0;

    for (let j of vertices) {
      let x = parseFloat(j.getAttribute('X'));
      let y = parseFloat(j.getAttribute('Y'));
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      coordinates.push([x, y]);
    }

    // **Detect Polygon vs. Polyline**
    if (regionType === 'Polygon') {
      coordinates.push(coordinates[0]); // Close the polygon by repeating the first point
    }

    let boundRect = [[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY]];

    // **Detect Color**
    let colorValue = i.getAttribute('LineColor');
    let hexColor = colorValue ? `#${parseInt(colorValue).toString(16).padStart(6, '0')}` : '#000000';

    let feature = {
      'type': 'Feature',
      'geometry': {
        'type': regionType === 'Polyline' ? 'LineString' : 'Polygon',
        'coordinates': [coordinates],
      },
      'properties': {
        'regionId': regionId,
        'lineColor': hexColor,
        'group': i.parentNode.getAttribute('Name') || 'Ungrouped',
      },
      'bound': {
        'type': 'BoundingBox',
        'coordinates': [[minX, minY], [maxX, maxY]],
      },
    };

    features.push(feature);
  }

  let output = Object.assign({}, template);
  output['geometries']['features'] = features;
  output['provenance']['image']['slide'] = document.getElementById('slide_id').value;
  output['provenance']['analysis']['execution'] = document.getElementById('annot_name').value;
  output['properties']['annotations']['name'] = document.getElementById('annot_name').value;
  output['provenance']['analysis']['name'] = document.getElementById('annot_name').value;
  output['provenance']['analysis']['execution_id'] = document.getElementById('annot_name').value;

  document.getElementById('output').textContent = JSON.stringify(output);
}
