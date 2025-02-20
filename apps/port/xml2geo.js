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

var aperio_map = {
  "0":"Polygon",
  "1":"Polygon",
  "2":"Polygon", // rectangle but should work?? haven't seen one yet
  "4": "Polyline"
};

function xml2geo() {
  let features = [];
  let input = document.getElementById('xml_in').value;
  xmlDoc = parser.parseFromString(input, 'text/xml');
  let annotations = xmlDoc.getElementsByTagName('Annotation'); // Assuming regions are inside 'Annotation' elements
  
  for (let annotation of annotations) {
    let annotationType = annotation.getAttribute('Type') || '0';  // Default to '0' if Type is not provided
    let annotationLineColor = annotation.getAttribute('LineColor');  // Get LineColor from the parent annotation
    let annotationId = annotation.getAttribute('Id');
    
    console.log('Processing Annotation ID:', annotationId, 'with Type:', annotationType);

    let regions = annotation.getElementsByTagName('Region');  // Get regions within this annotation
    for (let region of regions) {
      let regionId = region.getAttribute('Id');
      regionType = annotationType || region.getAttribute('Type'); // parent annotation type if present, else own (odd?)
      regionType = aperio_map[regionType]
      console.log('Processing Region ID:', regionId, 'as', regionType);

      let vertices = region.getElementsByTagName('Vertex');
      let coordinates = [];
      let minX = 99e99; let maxX = 0; let minY = 99e99; let maxY = 0;

      for (let vertex of vertices) {
        let x = parseFloat(vertex.getAttribute('X'));
        let y = parseFloat(vertex.getAttribute('Y'));
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
      let hexColor = annotationLineColor ? `#${parseInt(annotationLineColor).toString(16).padStart(6, '0')}` : '#000000';

      let feature = {
        'type': 'Feature',
        'geometry': {
          'type': regionType === 'Polyline' ? 'LineString' : 'Polygon',
          'coordinates': [coordinates],
        },
        'properties': {
          'regionId': regionId,
          'lineColor': hexColor,
          'group': region.parentNode.getAttribute('Name') || 'Ungrouped',
        },
        'bound': {
          'type': 'BoundingBox',
          'coordinates': [boundRect],
        },
      };

      features.push(feature);
    }
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
