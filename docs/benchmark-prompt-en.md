From memory, trace mainland China’s contiguous outline, the Yangtze and Yellow rivers, and provincial-level administrative centers. Exclude Hainan and Taiwan. Omit provincial borders. Do not browse, read files or query map data.

Write points as longitude,negative-latitude in decimal WGS84 degrees. Output only these four section headings and their data. Omit SVG tags, code fences and explanations.

OUTLINE
Start at the westernmost point (southernmost in a tie) and trace geographically counterclockwise without crossings.

Start with M. Write 25 space-separated coordinate pairs per line, with up to 20 coordinate lines (500 points). The last coordinate line may be short. Put Z on a line of its own to close the path without repeating the first point.

YANGTZE
Use M and space-separated coordinates from source to mouth along the main stem. Do not close the path.

YELLOW
Use the same format for the Yellow River main stem.

CITIES
Use one line per provincial-level unit: region city longitude,negative-latitude. Use Chinese names for the regions and cities. Include provincial and autonomous-region capitals, the four municipalities, Hong Kong and Macao. Exclude Hainan and Taiwan, for 32 lines total.
