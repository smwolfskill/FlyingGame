/* Author: Scott Wolfskill, wolfski2
 * Created:      03/06/17
 * Last edited:  05/02/17  */
/* This file is for generating terrain recursively using the Diamond-Square algorithm.
 * In MP2B I improved the performance by merging findFaceNormals and findVertexNormals
 * into a much more efficient findVertexNormals.
 * In MP4 I modified normalizeGrid to have it return the grid coordinate ranges [minX, maxX, minY, ...].
 */

/**
 * Return a random float in [0, 1) that's divided
 * @param {int} divisorMagnitude Number to square and then divide the random float by
 * @return {number}
 */
function randFloat(divisorMagnitude) {
    divisorMagnitude += 0.8;
    return Math.random() / (divisorMagnitude * divisorMagnitude * divisorMagnitude);
    //without squaring it (or even cubing it), it looks very jagged and unrealistic
}

/**
 * Converts a 2D coordinate (x, y) into a 1D vertex index from 0...(dimLength^2 - 1)
 * @param {int} x X-index
 * @param {int} y Y-index
 * @param {int} dimLength Length of both dimensions of a 2D array, which should be a power of 2 plus 1
 */
function coordToIndex(x, y, dimLength) {
    return (x * dimLength + y); //ex: 5x5: (0,3) maps to 3, and (1,2) maps to 7
}

/**
 * Uses the Diamond-Square algorithm to generate the height of all but 4 corners of heightGrid, and creates meshIndices array
 * @param {2D array} heightGrid Has 4 corners set; we change everything else
 * @param {int} dimLength Length of both dimensions of heightGrid, which should be a power of 2 plus 1
 * @param {1D array} meshIndices Uninitialized arr. of length 0 which will be len 3(2*(dimLength-1)^2); this is #triangles formed/3
 * @param {int} start Index of what we should consider the start of the array; heightGrid[start][start]
 * @param {int} end Index of what we should consider the end of the array; heightGrid[end][end]
 * @param {int} iter Current iteration we're on (starts at 1). Determines the magnitude of the random numbers.
 */
function diamondSquare(heightGrid, dimLength, meshIndices, startX=0, startY=0, endX=dimLength-1, endY=dimLength-1, iter=1) {
    var maxIter = Math.log2(dimLength-1);
    if(iter > maxIter) return; //base case; done. We split up (dimLength)x(dimLength) array log2(dimLength-1) - 1 times.
    var midX = (endX+startX)/2;
    var midY = (endY+startY)/2;
    //If I take the mean of all values including the random one, for some reason the terrain is much more spikey.
    //Diamond Step:
    heightGrid[midX][midY] = randFloat(iter) + mean(new Float32Array([/*randFloat(iter), */heightGrid[startX][startY], heightGrid[startX][endY],                                                                                 heightGrid[endX][startY], heightGrid[endX][endY]]), 4);
    //Square Step 1: Upper
    heightGrid[startX][midY] = randFloat(iter) + mean(new Float32Array([heightGrid[startX][startY], heightGrid[startX][endY], heightGrid[midX][midY]]), 3);
    //Square Step 2: Lower
    heightGrid[endX][midY] = randFloat(iter) + mean(new Float32Array([heightGrid[endX][startY], heightGrid[endX][endY], heightGrid[midX][midY]]), 3);
    //Square Step 3: Left
    heightGrid[midX][startY] = randFloat(iter) + mean(new Float32Array([heightGrid[startX][startY], heightGrid[endX][startY], heightGrid[midX][midY]]), 3);
    //Square Step 4: Right
    heightGrid[midX][endY] = randFloat(iter) + mean(new Float32Array([heightGrid[startX][endY], heightGrid[endX][endY], heightGrid[midX][midY]]), 3);
    //Form triangle mesh (just indices here) if we're at the smallest subdivision: a 3x3
    if(iter == maxIter) { //we have 3x3. Form 8 triangles (24 entries). Could be sorta simplified with messy for loop, but this is easier to understand
        var center = coordToIndex(midX, midY, dimLength);
        //Upper-Top (2):
        meshIndices.push(center);
        meshIndices.push(coordToIndex(startX, startY, dimLength));
        meshIndices.push(coordToIndex(startX, startY + 1, dimLength)); //1
        meshIndices.push(center);
        meshIndices.push(coordToIndex(startX, startY + 1, dimLength));
        meshIndices.push(coordToIndex(startX, startY + 2, dimLength)); //2
        //Right sides (2):
        meshIndices.push(center);
        meshIndices.push(coordToIndex(startX, startY + 2, dimLength));
        meshIndices.push(coordToIndex(startX + 1, startY + 2, dimLength)); //3
        meshIndices.push(center);
        meshIndices.push(coordToIndex(startX + 1, startY + 2, dimLength));
        meshIndices.push(coordToIndex(startX + 2, startY + 2, dimLength)); //4
        //Bottom-bottom (2):
        meshIndices.push(center);
        meshIndices.push(coordToIndex(startX + 2, startY + 1, dimLength));
        meshIndices.push(coordToIndex(startX + 2, startY + 2, dimLength)); //5
        meshIndices.push(center);
        meshIndices.push(coordToIndex(startX + 2, startY, dimLength));
        meshIndices.push(coordToIndex(startX + 2, startY + 1, dimLength)); //6
        //Left sides (2):
        meshIndices.push(center);
        meshIndices.push(coordToIndex(startX + 1, startY, dimLength));
        meshIndices.push(coordToIndex(startX + 2, startY, dimLength)); //7
        meshIndices.push(center);
        meshIndices.push(coordToIndex(startX, startY, dimLength));
        meshIndices.push(coordToIndex(startX + 1, startY, dimLength)); //8
    }
    //Recursively do the algorithm again on subdivided 4 squares, and raise the iter to lower the magnitude of the random float
    diamondSquare(heightGrid, dimLength, meshIndices, startX, startY, midX, midY, iter+1); //do top-left square
    diamondSquare(heightGrid, dimLength, meshIndices, midX, startY, endX, midY, iter+1); //do bottom-left square
    diamondSquare(heightGrid, dimLength, meshIndices, startX, midY, midX, endY, iter+1); //do top-right square
    diamondSquare(heightGrid, dimLength, meshIndices, midX, midY, endX, endY, iter+1); //do bottom-right square
}

/**
 * Finds the max height in heightGrid, and divides all heights by the maximum, so that they will be <= 1.
 * Then the vertices array is created, transforming [x][y] indices into normalized values in (-1, 1).
 * Use this AFTER diamondSquare().
 * @param {2D array} heightGrid 2D square array that we normalize
 * @param {int} dimLength Length of both dimensions of heightGrid, which should be a power of 2 plus 1
 * @param {1D array} meshVertices Uninitialized array of length 3 * (dimLength)^2
 * @return {1D array} 6-length array with the ranges the grid vertices are in; [minX, maxX, minY, ...]
 */
function normalizeGrid(heightGrid, dimLength, meshVertices) {
    var gridRange = [1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
    //1: Find min and max height
    for(var i = 0; i < dimLength; i++) {
        for(var j = 0; j < dimLength; j++) {
            if(heightGrid[i][j] < gridRange[2]) gridRange[2] = heightGrid[i][j]; //new min
            if(heightGrid[i][j] > gridRange[3]) gridRange[3] = heightGrid[i][j]; //new max
        }
    }
    //2: Normalize coordinates and assign to the the mesh vertex buffer
    var mid = (dimLength-1)/2;
    for(var i = 0; i < dimLength; i++) {
        for(var j = 0; j < dimLength; j++) {
            heightGrid[i][j] /= gridRange[3]; //max height
            //Assign to meshVertices
            var startIndex = 3 * coordToIndex(i, j, dimLength); //3 values per vertex
            meshVertices[startIndex] = (i - mid) / (mid+1); //normalized x-value. Subtract mid first since origin is center canvas
            meshVertices[startIndex + 2] = (j - mid) / (mid+1); //normalized z-value
            meshVertices[startIndex + 1] = heightGrid[i][j]; //normalized height (y)
        }
    }
    gridRange[0] = -1.0 * mid / (mid + 1);
    gridRange[1] = (dimLength - 1 - mid) / (mid + 1);
    gridRange[2] = gridRange[2] / gridRange[3]; //normalized height
    gridRange[3] = 1.0;
    gridRange[4] = gridRange[0]; //same min bound as X
    gridRange[5] = gridRange[1]; //same max bound as X 
    return gridRange;
}

/**
 * NEW Method that combines the old findFaceNormals and findVertexNormals into one and is much more efficient
 * Given the mesh vertices and indices, calculate face normals and use them to calculate the vertex normals
 * @param {Array} meshVertices Should be already calculated in normalizeGrid()
 * @param {Array} meshIndices Should be already calculated in diamondSquare()
 * @param {int} dimLength Length of both dimensions of the original heightGrid, which should be a power of 2 plus 1
 * @param {Array} vertexNormals Uninitialized array of length 3 * (dimLength)^2
 */
function findVertexNormals(meshVertices, meshIndices, dimLength, vertexNormals) {
    var numTriangles = 2 * (dimLength-1) * (dimLength-1);
    for(var v = 0; v < dimLength * dimLength; v++) { //initialize vertexFaces and vertexNormals
        vertexNormals[3*v    ] = 0;
        vertexNormals[3*v + 1] = 0;
        vertexNormals[3*v + 2] = 0;
    }
    for(var i = 0; i < numTriangles; i++) {
        var v0 = [meshVertices[3*meshIndices[3*i    ]], meshVertices[3*meshIndices[3*i    ] + 1], meshVertices[3*meshIndices[3*i    ] + 2]];
        var v1 = [meshVertices[3*meshIndices[3*i + 1]], meshVertices[3*meshIndices[3*i + 1] + 1], meshVertices[3*meshIndices[3*i + 1] + 2]];
        var v2 = [meshVertices[3*meshIndices[3*i + 2]], meshVertices[3*meshIndices[3*i + 2] + 1], meshVertices[3*meshIndices[3*i + 2] + 2]];
        var curNormal = cross(difference(v2, v0), difference(v1, v0));
        curNormal = normalize(curNormal);
        //vertex normals:
        for(var c = 0; c < 3; c++) { //c for component; x, then y, then z
            vertexNormals[3*meshIndices[3*i    ] + c] += curNormal[c]; //v0
            vertexNormals[3*meshIndices[3*i + 1] + c] += curNormal[c]; //v1
            vertexNormals[3*meshIndices[3*i + 2] + c] += curNormal[c]; //v2
        }
    }
    for(var v = 0; v < dimLength * dimLength; v++) { //Normalize vertexNormals
        var vNorm = normalize([vertexNormals[3*v], vertexNormals[3*v+1], vertexNormals[3*v+2]]);
        vertexNormals[3*v] = vNorm[0];
        vertexNormals[3*v + 1] = vNorm[1];
        vertexNormals[3*v + 2] = vNorm[2];
    }
}

/**
 * Calculate mean of any amount of numbers.
 * @param {array} numbers Numbers to calculate the mean of
 * @param {int} length How many numbers we're taking the mean of
 * @return {number}
 */
function mean(numbers, length) {
    var sum = 0.0;
    for(var i = 0; i < length; i++) {
        sum += numbers[i];
    }
    return (sum / length);
}

/**
 * Find the difference of two 3-vectors; a - b.
 * @param {Array} a
 * @param {Array} b
 * @return {Array}
 */
function difference(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
    
/**
 * Divide a vector a by a scalar d; a / d.
 * @param {Array} a
 * @param {number} d Divisor
 * @return {Array}
 */
function quotient(a, d) {
    return [a[0] / d, a[1] / d, a[2] / d];
}

/**
 * Find the cross product of two 3-vectors.
 * @param {Array} a
 * @param {Array} b
 * @return {Array}
 */
function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Find the norm, or magnitude of a vector a -> ||a||
 * @param {Array} a
 * @return {number}
 */
function norm(a) {
    var sum = 0.0;
    for(var i = 0; i < a.length; i++) {
        sum += a[i] * a[i];
    }
    return Math.sqrt(sum);
}

/**
 * Find the norm of a vector a and divide a by it; a -> a / ||a||
 * @param {Array} a
 * @return {Array}
 */
function normalize(a) {
   return quotient(a, norm(a)); 
}