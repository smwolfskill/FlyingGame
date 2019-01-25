/* @author      Scott Wolfskill, wolfski2
 * @created     03/06/17
 * @last edit   05/07/17  */
var gl;
var canvas;
var shaderProgram;

//User options (set to defaults):
var gridSize = 6; //generate (2^gridSize + 1)^2 grid of vertices
var fov = 60; //field of view. Allowed 45..90. Default 60.
var turnFactor = 1.0; //Option scaling turn angle (rotDegrees) between [0.5, 2].
var fog = false; //true -> render fog

//Score, messages:
var score = 0; //player score (spheres collected)
var scoreNode; //text node that will display the player score in the HTML
var msg_info_node; //text node that will display a message when player hits a bad sphere
var msg_score_node; //text node that will display a message with how many points were gained/lost when player hits a sphere
var msg_info_timeLeft = 0; //remaining time to show the message
var msg_score_timeLeft = 0;
var msg_time = 2000; //normal duration for a message to display

var tolerance; //amount to increase the radius by as tolerance to make collisions easier
var reverseGravity = false; //hitting a green sphere sets this to true for a time
var doublePoints = false; //...

var oldTime = Date.now();
var curTime;

//Sphere Information:
var sphereRadius; //radius WHEN scaled
var sphereScale = 0.08;
var sphereCount = [0, 0, 0, 0]; //# existing spheres in the game of each type (silver, gold, pink (bad), grn)
var sphereMax = [16, 6, 8, 1]; //max. # spheres that can be in-game at any time of each type
var sphereCooldown = [3000, 6000, 3000, 80000]; //spawn cooldown in milliseconds for each type. Enforced through probability (not strictly)
var sphereLastSpawn = [3000, 3000, 3000, 0]; //time (ms) since a sphere last spawned of each type.
var sphereColors = [0.8, 0.8, 0.8,   1.0, 0.8, 0.0,   1.0, 0.0, 0.3,   0.17, 0.88, 0.0]; //colors of each type (silver, gold, pink, grn)
var sphereColors_string = ["color:#cccccc", "color:#ffcc00", "color:#ff004c", "color:#2ce000"];
var sphereLists = [null, null, null, null]; //Will hold all spheres of each type as an array of SphereLists.

//Mesh info and buffers:
var terrainRange; //6-length array with [minX, maxX, minY, ...] for terrain vertex coordinate bounds.
var terrainScale = [4.0, 2.0, 4.0];
var terrainVertexBuf; //terrain vertex position buffer
var terrainIndexBuf;
var terrainNormalBuf; //terrain normals buffer
var sphereVertexBuf;
var sphereIndexBuf;
var sphereNormalBuf;

//Movement:
var speed = 0.002; //speed "airplane" moves forward
var minSpeed = 0.002;
var maxSpeed = 0.02;
var speedIncrement = 0.001; //unit to increment/decrement speed by with user controls
var paused = false; //control w/ Spacebar (pause) and Enter (unpause). If true, plane & objects don't move but can look around

// View parameters
var eyePt = vec3.fromValues(0.0,1.0, 2.5); //Is set elsewhere according to terrain bounds
var viewDir = vec3.fromValues(0.0,0.0,-1.0);
var up = vec3.fromValues(0.0,1.0,0.0);
var viewPt = vec3.fromValues(0.0,0.0,0.0);
// Quaternion view params
var eyeQuatUD = quat.create(); //rotation moving Up/Down, about axis perpendicular to up and eyeDir
var eyeQuatRoll = quat.create(); //rotation about the viewDir axis (roll)
var eyeQuatLR = quat.create(); //rotation moving Left/Right, about the up axis
var rotDegrees = 1.0;//0.5; //degrees to increment/decrement axis rotation with user controls

// Create the normal
var nMatrix = mat3.create();

// Create Model matrix
var mvMatrix = mat4.create();

//Create Projection matrix
var pMatrix = mat4.create();

var mvMatrixStack = [];

/**
 * Pushes matrix onto modelview matrix stack
 */
function mvPushMatrix() {
    var copy = mat4.clone(mvMatrix);
    mvMatrixStack.push(copy);
}

/**
 * Pops matrix off of modelview matrix stack
 */
function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
      throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

function setMatrixUniforms() {
    uploadModelViewMatrixToShader();
    uploadNormalMatrixToShader();
    uploadProjectionMatrixToShader();
}

/**
 * Send fog boolean (true -> render fog) to fragment shader
 */
function uploadFogToShader() {
    gl.uniform1i(shaderProgram.fogUniform, fog);
}

/**
 * Upload terrain boolean to fragment shader
 * @param {bool} terrain True if rendering terrain (use colormap); false for all other objects
 */
function uploadTerrainToShader(terrain) {
    gl.uniform1i(shaderProgram.terrainUniform, terrain);
}

//-------------------------------------------------------------------------
/**
 * Sends Modelview matrix to both shaders
 */
function uploadModelViewMatrixToShader() {
    gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
    gl.uniformMatrix4fv(shaderProgram.fs_mvMatrixUniform, false, mvMatrix);
}

//-------------------------------------------------------------------------
/**
 * Sends projection matrix to shader
 */
function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
}

//-------------------------------------------------------------------------
/**
 * Generates and sends the normal matrix to the shader
 */
function uploadNormalMatrixToShader() {
  mat3.fromMat4(nMatrix,mvMatrix);
  mat3.transpose(nMatrix,nMatrix);
  mat3.invert(nMatrix,nMatrix);
  gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, nMatrix);
}

function degToRad(degrees) {
        return degrees * Math.PI / 180;
}

function createGLContext(canvas) {
  var names = ["webgl", "experimental-webgl"];
  var context = null;
  for (var i=0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch(e) {}
    if (context) {
      break;
    }
  }
  if (context) {
    context.viewportWidth = canvas.width;
    context.viewportHeight = canvas.height;
  } else {
    alert("Failed to create WebGL context!");
  }
  return context;
}

function loadShaderFromDOM(id) {
  var shaderScript = document.getElementById(id);
  
  // If we don't find an element with the specified id
  // we do an early exit 
  if (!shaderScript) {
    return null;
  }
  
  // Loop through children for the found DOM element and build up shader source code as a string
  var shaderSource = "";
  var currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType == 3) { // 3 corresponds to TEXT_NODE
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }
 
  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }
 
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
 
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  } 
  return shader;
}

function setupShaders() {
  vertexShader = loadShaderFromDOM("shader-vs");
  fragmentShader = loadShaderFromDOM("shader-fs");
  
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);
  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
    
  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
    shaderProgram.fs_mvMatrixUniform = gl.getUniformLocation(shaderProgram, "fs_uMVMatrix");
  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
  shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
  shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition");    
  shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor");  
  shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");
  shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");
    shaderProgram.fogUniform = gl.getUniformLocation(shaderProgram, "fog");
    shaderProgram.terrainUniform = gl.getUniformLocation(shaderProgram, "terrain");
}

function setupBuffers() {
  //1. Set up the grid and mesh
    var dimLength = Math.pow(2, gridSize) + 1; //create (2^gridSize + 1) x (2^gridSize + 1) grid
    var heightGrid = new Array(dimLength);
    var terrainIndices = new Array(0); //there will be 2*(dimLength-1)^2  triangles; 3 values for each
    var terrainVertices = new Float32Array(3*dimLength*dimLength);
    var terrainNormals = new Float32Array(3*dimLength*dimLength);
    for(var i = 0; i < dimLength; i++) {
        heightGrid[i] = new Array(dimLength);
    }
    //Arbitrary 4 corners initialization
    heightGrid[0][0] = 0.0;
    heightGrid[0][dimLength-1] = 0.0;
    heightGrid[dimLength-1][0] = 0.0;
    heightGrid[dimLength-1][dimLength-1] = 0.0;
    
    diamondSquare(heightGrid, dimLength, terrainIndices); //generate grid and mesh indices for the buffer
    terrainRange = normalizeGrid(heightGrid, dimLength, terrainVertices); //normalize grid and generate vertex list for the dimLength
    for(var i = 0; i < 3; i++) { //scale terrain ranges
        terrainRange[2*i] *= terrainScale[i];
        terrainRange[2*i+1] *= terrainScale[i];
    }
    console.log("terrainRange = " + terrainRange.toString());
    eyePt[0] = 0.0; //centered over x-axis (L/R)
    eyePt[1] = terrainRange[3] + 0.1; //have camera height start at max terrain height + some constant
    eyePt[2] = terrainRange[5] + 0.1; //have camera depth start at max terrain depth + some constant
    findVertexNormals(terrainVertices, terrainIndices, dimLength, terrainNormals); //find terrain normals
  //2. Standard buffer calls
  terrainVertexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, terrainVertexBuf);
  gl.bufferData(gl.ARRAY_BUFFER, terrainVertices, gl.STATIC_DRAW); //no movement
  terrainVertexBuf.itemSize = 3;
  terrainVertexBuf.numberOfItems = dimLength * dimLength;
    
  terrainIndexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrainIndexBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(terrainIndices), gl.STATIC_DRAW);
  terrainIndexBuf.size = 1;
  terrainIndexBuf.numberOfItems = 3*2*(dimLength-1)*(dimLength-1);
    
  terrainNormalBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, terrainNormalBuf);
  gl.bufferData(gl.ARRAY_BUFFER, terrainNormals, gl.STATIC_DRAW);
  terrainNormalBuf.itemSize = 3;
  terrainNormalBuf.numItems = dimLength * dimLength;//2*(dimLength-1)*(dimLength-1);
}

//-------------------------------------------------------------------------
/**
* Populates buffers with data for spheres. Taken from Discussion Demo 5, modified to find sphere radius (SLOW).
* @return {float} Sphere radius.
*/
function setupSphereBuffers() {
	var sphereSoup=[];
	var sphereNormals=[];
	var numT=sphereFromSubdivision(6,sphereSoup,sphereNormals);
	console.log("Generated ", numT, " triangles");
	sphereVertexBuf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexBuf); 
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereSoup), gl.STATIC_DRAW);
	sphereVertexBuf.itemSize = 3;
	sphereVertexBuf.numItems = numT*3;
	console.log(sphereSoup.length/9);

	// Specify normals to be able to do lighting calculations
	sphereNormalBuf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, sphereNormalBuf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereNormals), gl.STATIC_DRAW);
	sphereNormalBuf.itemSize = 3;
	sphereNormalBuf.numItems = numT*3;

	console.log("Normals ", sphereNormals.length/3);
    
    //My addition: find radius.
    //Find minX and maxX in case it's not perfectly centered.
    var ranges = [1.0, -1.0]; //format [minX, maxX]
    for(var i = 0; i < sphereSoup.length / 3; i += 3) {
        if(sphereSoup[i] < ranges[0]) ranges[0] = sphereSoup[i]; //new minX
        if(sphereSoup[i] > ranges[1]) ranges[1] = sphereSoup[i]; //new maxX
    }
    return (ranges[1] - ranges[0]) / 2; //radius according to X-axis
}

//-------------------------------------------------------------------------
/**
 * Sends light information to the shader
 * @param {Float32Array} loc Location of light source
 * @param {Float32Array} d Diffuse light strength
 * @param {Float32Array} s Specular light strength
 */
function uploadLightsToShader(loc,d,s) {
  gl.uniform3fv(shaderProgram.uniformLightPositionLoc, loc);
  gl.uniform3fv(shaderProgram.uniformDiffuseLightColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularLightColorLoc, s);
}

/**
 * Send ambient light information (object color) to shader
 * @param {Float32Array} a Ambient light strength
 */
function uploadAmbientLightToShader(a) {
    gl.uniform3fv(shaderProgram.uniformAmbientLightColorLoc, a);
}
//-------------------------------------------------------------------------

/**
 * Draw the terrain.
 * @param {float} rotX Amount in degrees to rotate the terrain about the X axis.
 * @param {float} rotY Amount in degrees to rotate the terrain about the Y axis.
 * @param {float} rotZ Amount in degrees to rotate the terrain about the Z axis.
 * @param {float} scale Amount to scale the terrain by
 */
function drawTerrain(rotX, rotY, rotZ) {
    if (typeof(rotX)==='undefined') rotX = 0.0;
    if (typeof(rotY)==='undefined') rotY = 0.0;
    if (typeof(rotZ)==='undefined') rotZ = 0.0;
    mvPushMatrix();
    uploadTerrainToShader(true);
    
    mat4.scale(mvMatrix, mvMatrix, vec3.fromValues(terrainScale[0], terrainScale[1], terrainScale[2]));
    if(rotX != 0.0) mat4.rotateX(mvMatrix, mvMatrix, degToRad(rotX));
    if(rotY != 0.0) mat4.rotateY(mvMatrix, mvMatrix, degToRad(rotY));
    if(rotZ != 0.0) mat4.rotateZ(mvMatrix, mvMatrix, degToRad(rotZ)); //rotate around center of grid if desired
    setMatrixUniforms();
  //Buffer calls, and draw:
  gl.bindBuffer(gl.ARRAY_BUFFER, terrainVertexBuf);
  gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, 
                         terrainVertexBuf.itemSize, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, terrainNormalBuf); //normals buffer
  gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute, 
                           terrainNormalBuf.itemSize, gl.FLOAT, false, 0, 0); 
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrainIndexBuf);
  gl.drawElements(gl.TRIANGLES, terrainIndexBuf.numberOfItems, gl.UNSIGNED_SHORT, 0);
    mvPopMatrix();
}

/**
 * Draw a polygonal object without a tri-index buffer and with uniform color shading.
 * @param vertexBuf The vertex buffer for the polygonal object to draw
 * @param normalBuf The vertex normal buffer for the polygonal object to draw
 * @param {Float32Array} meshColor Vec3 for uniform object color
 * @param {Float32Array} position Start position of object
 * @param {float} scale Amount to scale the object by
 */
function drawMesh(vertexBuf, normalBuf, meshColor, position, scale) {
    mvPushMatrix();
    uploadTerrainToShader(false);
    uploadAmbientLightToShader(meshColor);
    
    if(typeof(position)!=='undefined') mat4.translate(mvMatrix, mvMatrix, position);
    if(typeof(scale) !== 'undefined') mat4.scale(mvMatrix, mvMatrix, vec3.fromValues(scale, scale, scale));
    setMatrixUniforms();
    
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuf);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, vertexBuf.itemSize, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuf);
    gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute, normalBuf.itemSize, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.TRIANGLES, 0, vertexBuf.numItems); 
    
    mvPopMatrix();
}

function draw() { 
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // We'll use perspective
    mat4.perspective(pMatrix,degToRad(fov), gl.viewportWidth / gl.viewportHeight, 0.1, 200.0);

    // We want to look down -z, so create a lookat point in that direction    
    vec3.add(viewPt, eyePt, viewDir);
    // Then generate the lookat matrix and initialize the MV matrix to that view
    mat4.lookAt(mvMatrix,eyePt,viewPt,up);    
    
    uploadFogToShader();
    //uploadLightsToShader([0,1,1],[1.0,0.5,0.0],[0.0,0.0,0.0]); //old
    uploadLightsToShader([0,1,1],[0.17,0.17,0.17],[0.1,0.1,0.1]);
    
    //Draw the terrain
    drawTerrain(0.0, 0.0, 0.0);
    
    //Draw all existing spheres of each type:
    for(var i = 0; i < sphereLists.length; i++) {
        if(sphereLists[i] == null) continue; //no spheres of this type exist yet
        var curSphere = sphereLists[i].head;
        while(curSphere != null) {
            drawMesh(sphereVertexBuf, sphereNormalBuf, sphereColors.slice(3*i, 3*i+3), curSphere.position, 0.05); //silver spheres (normal score)
            curSphere = curSphere.next;
        }
    }
}

var pressedKeys = {};

function handleKeyDown(event) {
    pressedKeys[event.keyCode] = true;
}

function handleKeyUp(event) {
    pressedKeys[event.keyCode] = false;
}

/**
 * Handle any keys of interest that were pressed in this frame (camera movement)
 */
function handleKeys() {
    //   http://keycode.info/
    if(pressedKeys[37] || pressedKeys[65]) { //Left arrow OR A: plane turn left
        quat.setAxisAngle(eyeQuatLR, up, degToRad(turnFactor * rotDegrees));
        vec3.transformQuat(viewDir,viewDir,eyeQuatLR);
    }
    if(pressedKeys[39] || pressedKeys[68]) { //Right arrow OR D: plane turn right
        quat.setAxisAngle(eyeQuatLR, up, degToRad(turnFactor * -1.0 * rotDegrees));
        vec3.transformQuat(viewDir,viewDir,eyeQuatLR);
    }
    if(pressedKeys[38] || pressedKeys[87]) { //Up arrow OR W: pitch up
        var axis = normalize(cross(viewDir, up)); //rot. about the axis perpendicular to both viewDir and up
        //var axisTemp = cross([0.0, 0.0, -1.0], up);
        //if(axis != axisTemp) console.log("axis = " + axis.toString() + "; old = " + axisTemp.toString());
        quat.setAxisAngle(eyeQuatUD, axis, degToRad(turnFactor * rotDegrees)) //create the quat
        vec3.transformQuat(viewDir,viewDir,eyeQuatUD); //apply to viewDir
        vec3.transformQuat(up,up,eyeQuatUD); //apply to up (so viewDir and up are always perpendicular)
    }
    if(pressedKeys[40] || pressedKeys[83]) { //Down arrow OR S: pitch down
        var axis = normalize(cross(viewDir, up));
        quat.setAxisAngle(eyeQuatUD, axis, degToRad(turnFactor * -1.0 * rotDegrees)) //create the quat
        vec3.transformQuat(viewDir,viewDir,eyeQuatUD); //apply to viewDir
        vec3.transformQuat(up,up,eyeQuatUD); //apply to up (so viewDir and up are always perpendicular)
    }
    if(pressedKeys[81]) { //Q: Roll left
        quat.setAxisAngle(eyeQuatRoll, viewDir, degToRad(turnFactor * -1.0 * rotDegrees)) //create the quat
        vec3.transformQuat(up,up,eyeQuatRoll); //apply to up; viewDir remains the same
    }
    if(pressedKeys[69]) { //E: Roll right
        quat.setAxisAngle(eyeQuatRoll, viewDir, degToRad(turnFactor * rotDegrees)) //create the quat
        vec3.transformQuat(up,up,eyeQuatRoll); //apply to up; viewDir remains the same
    }
    if(pressedKeys[187] || pressedKeys[49]) { // =/+ OR 1: Increase speed
        if(speed < maxSpeed) speed += speedIncrement;
    }
    if(pressedKeys[189] || pressedKeys[51]) { // - OR 3: Decrease speed
        if(speed > minSpeed) speed -= speedIncrement;
    }
    if(pressedKeys[32]) { //Spacebar: pause
        paused = true; //FIX: Too many frames so too sensitive - can exclude 
    }
    if(pressedKeys[13]) { //Enter: unpause
        paused = false;
    }
}

/**
 * Display messages (+1, Double Points, etc.) if their display timers are non-zero.
 */
function showMessages() {
    if(msg_info_timeLeft > 0) {
        if(doublePoints) { //hit a green sphere: Display perks and countdown timers
            var msgStr = "Double Points (" + Math.ceil(msg_info_timeLeft / 1000).toString() + ")! ";
            if(msg_info_timeLeft < 10000) {
                reverseGravity = false; //reverse gravity expired
                msg_info_node.nodeValue = msgStr;
            } else { //still have reverse gravity
                msg_info_node.nodeValue = msgStr + "Reverse Gravity (" + Math.ceil((msg_info_timeLeft - 10000)/1000).toString() + ")!";
            }
        } else { //hit a pink sphere: warning message
            msg_info_node.nodeValue = "Avoid the pink spheres!"
        }
    } else {
        doublePoints = false;
        reverseGravity = false;
        msg_info_node.nodeValue = "";
    }
    if(msg_score_timeLeft <= 0) msg_score_node.nodeValue = "";
}

function startup() {
  canvas = document.getElementById("myGLCanvas");
    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;
    //Text Nodes for HTML messages:
    var scoreElement = document.getElementById("score");
    scoreNode = document.createTextNode(""); // Create text nodes to save some time for the browser.
    scoreElement.appendChild(scoreNode); // Add those text nodes where they need to go
    var msg_info_Element = document.getElementById("msg_info");
    msg_info_Element.style = sphereColors_string[2];
    msg_info_node = document.createTextNode("");
    msg_info_Element.appendChild(msg_info_node);
    var msg_score_Element = document.getElementById("msg_score");
    msg_score_node = document.createTextNode("");
    msg_score_Element.appendChild(msg_score_node);
    for(var i = 0; i < sphereLists.length; i++) { //set colors of some of the instructions text
        document.getElementById("text_sphere" + i.toString()).style = sphereColors_string[i];
    }
  gl = createGLContext(canvas);
  setupShaders(); 
  setupBuffers();
    sphereRadius = sphereScale * setupSphereBuffers();
    tolerance = sphereRadius; //make collision twice as easy
  gl.clearColor(0.9, 0.9, 0.9, 1.0); //values from 0.0 (blk) ... 1.0 (white)
  gl.enable(gl.DEPTH_TEST);
  tick();
}

/**
 * Update game objects, draw, and do bookkeeping (options, keys, etc.) at the end.
 */
function tick() {
    requestAnimFrame(tick);
    curTime = Date.now();
    if(!paused) {
        var timeElapsed = curTime - oldTime; //time since last frame in milliseconds
        if(msg_info_timeLeft > 0) msg_info_timeLeft -= timeElapsed;
        if(msg_score_timeLeft > 0) msg_score_timeLeft -= timeElapsed;
        //1. Generate spheres, update sphere PVAs, do collision detection
        var collisions = new Array(sphereLists.length); //# collisions for each sphere type
        for(var i = 0; i < sphereLists.length; i++) {
            /* Spawning Probability Rules:
             * 1. Greater the chance the less spheres of this type there are. No chance if already at max.
             * 2. Lessen the chance the closer to the last spawn of this type we are (in time). 
             *    Doesn't affect chances if more time has already elapsed than the cooldown time.
             * 3. If chances succeed, we only spawn in 1 sphere of a type at a time.  */
            //A. Calculate spawn chances
            sphereLastSpawn[i] += timeElapsed;
            var spawnChance = 1 - (sphereCount[i] / sphereMax[i]);
            if(sphereLastSpawn[i] < sphereCooldown[i])
                spawnChance *= (sphereLastSpawn[i]*sphereLastSpawn[i]) / (sphereCooldown[i]*sphereCooldown[i]);
            //B. Generate random # and see if we should spawn
            if(Math.random() < spawnChance) { //spawn success: spawn 1
                //Have them spawn only on the inner half of the grid to help encourage user to not fly off edge of the map
                sphereLists[i] = createSpheres(1, sphereRadius, [terrainRange[0]/2, terrainRange[1]/2, 1.5*terrainRange[3], 3*terrainRange[3], terrainRange[4]/2, terrainRange[5]/2], [-0.1, 0.1, -0.2, 1.0, -0.1, 0.1], sphereLists[i]);
                sphereLastSpawn[i] = 0;
            }
            if(sphereLists[i] != null) {
                collisions[i] = updatePVA(sphereLists[i], timeElapsed, terrainRange[2], eyePt, tolerance, true, reverseGravity);
                sphereCount[i] = sphereLists[i].length;
            }
        }
        
        //2. Calculate score based on sphere collisions and what each type does and display messages
        if(collisions[2] > 0) { //Hit bad sphere: lose all points!
            if(score > 0) { //don't want to show "-0" if score already 0
                msg_score_node.nodeValue = "-" + score.toString();
                document.getElementById("msg_score").style = sphereColors_string[2];
                msg_score_timeLeft = msg_time;
            }
            if(!doublePoints) { //only display warning message if double points/reverse gravity message not already showing
                document.getElementById("msg_info").style = sphereColors_string[2];
                msg_info_timeLeft = msg_time; //around 2 secs
            }
            score = 0; //lose all points for bad sphere
        } else {
            var multiplier = 1.0;
            if(doublePoints) multiplier = 2.0;
            if(collisions[0] > 0) { //hit silver
                msg_score_node.nodeValue = "+" + (multiplier * collisions[0]).toString();
                document.getElementById("msg_score").style = sphereColors_string[0];
                msg_score_timeLeft = msg_time;
                score += multiplier * collisions[0]; //award 1 point for each silver sphere
            }
            if(collisions[1] > 0) { //hit gold
                msg_score_node.nodeValue = "+" + (multiplier*collisions[1]*3).toString();
                document.getElementById("msg_score").style = sphereColors_string[1];
                msg_score_timeLeft = msg_time;
                score += multiplier * collisions[1] * 3; //award 3 points for each gold sphere
            }
        }
        if(collisions[3] > 0) { //hit green
            document.getElementById("msg_info").style = sphereColors_string[3];
            msg_info_timeLeft = 15000; //double points for 15s, reverse gravity for 5s
            reverseGravity = true;
            doublePoints = true;
        }
    }
    checkOptions();
    draw();
    handleKeys();
    showMessages();
    animate();
    scoreNode.nodeValue = score; //update score counter in HTML
    oldTime = curTime;
}

/**
 * Check if any inputs have changed:
 * 1. gridSize: If changed, re-create the grid
 * 2. FOV: Set parameter
 * 3. Turn Speed: Convert range in [0, 100] to [0.5, 2.0] to use as a multiplier on turn speed (rotDegrees)
 * 4. Fog: Set parameter
 */
function checkOptions() {
    var newGridSize = document.getElementById("gridSize").value;
    var newFov = document.getElementById("fov").value;
    var newTurnSpeed = document.getElementById("turnSpeed").value;
    fog = document.getElementById("fog").checked;
    
    if(newTurnSpeed >= 50) turnFactor = newTurnSpeed / 50;
    else turnFactor = 0.5 + newTurnSpeed / 50;
    if(newFov >= 45 && newFov <= 90) fov = newFov;
    if(newGridSize > 0 && newGridSize < 100 && newGridSize != gridSize) {
        gridSize = newGridSize;
        setupBuffers();
    }
}

/**
 * Move airplane/camera forward if not paused
 */
function animate() {
    if(!paused) {
        //Move in direction of viewDir
        var velocity = vec3.fromValues(speed*viewDir[0], speed*viewDir[1], speed*viewDir[2]);
        vec3.add(eyePt, velocity, eyePt);
    }
}