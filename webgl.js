var vertexShader=`
attribute vec2 a_position;
attribute vec2 a_texCoord;

uniform vec2 u_resolution;

varying vec2 v_texCoord;

void main() {
	// convert the rectangle from pixels to 0.0 to 1.0
	vec2 zeroToOne = a_position / u_resolution;

	// convert from 0->2 to -1->+1 (clipspace)
	vec2 clipSpace = (zeroToOne * 2.0) - 1.0;

	gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);

	// pass the texCoord to the fragment shader
	// The GPU will interpolate this value between points.
	v_texCoord = a_texCoord;
}
`

var fragmentShader=`
precision mediump float;

// our texture
uniform sampler2D u_image;
uniform vec2 u_textureSize;

// the texCoords passed in from the vertex shader.
varying vec2 v_texCoord;

void main() {
	//vec2 onePixel = vec2(100.0, 100.0) / u_textureSize;
	vec2 onePixel = vec2(100.0, 100.0) / 1600.0;
	gl_FragColor = (
	texture2D(u_image, v_texCoord) +
	texture2D(u_image, v_texCoord + vec2(onePixel.x, 0.0)) +
	texture2D(u_image, v_texCoord + vec2(-onePixel.x, 0.0))) / 3.0;
}
`

var fShaderT1=`
precision mediump float;

uniform sampler2D u_image;
uniform vec2 u_textureSize;

varying vec2 v_texCoord;

void main() {

	gl_FragColor = (
	($kernelData)/$kernelWeight;
}
`

function getFShaderLine(p, lastOne){
	return "texture2D(u_image, v_texCoord + vec2(" + p[0].toFixed(1) + ","
	+ p[1].toFixed(1)  + ")/u_textureSize ) * " +  p[2].toFixed(1) + (lastOne ?")":" +") + "\n"
}

function kernelToShader(kernel, kernelWeight){
	
	var data=""
	var last= kernel[kernel.length -1]
	for (el of kernel) {
		data+= getFShaderLine(el, el==last)
	}

	return fShaderT1.replace("$kernelData", data)
	.replace("$kernelWeight", kernelWeight.toFixed(1))
}


function loadShader(gl, shaderSource, shaderType) {
	
    // Create the shader object
    var shader = gl.createShader(shaderType);

    // Load the shader source
    gl.shaderSource(shader, shaderSource);

    // Compile the shader
    gl.compileShader(shader);

    // Check the compile status
    var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
    if (!compiled) {
      // Something went wrong during compilation; get the error
      var lastError = gl.getShaderInfoLog(shader);
      console.error("*** Error compiling shader '" + shader + "':" + lastError);
      gl.deleteShader(shader);
      return null;
  }

  return shader;
}

function createProgram(gl, vShader, fShader) {
	
	//var kernel= [[-10,0,80],[10,0,80]]
	var fsSource= kernelToShader(kernel, 255)

	var vs= loadShader(gl, vShader,  gl.VERTEX_SHADER)
	var fs= loadShader( gl, fsSource, gl.FRAGMENT_SHADER )

	var program = gl.createProgram()

	gl.attachShader(program, vs)
	gl.attachShader(program, fs)

	gl.linkProgram(program);

    // Check the link status
    var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
        // something went wrong with the link
        var lastError = gl.getProgramInfoLog(program);
        console.error("Error in program linking:" + lastError);

        gl.deleteProgram(program);
        return null;
    }
    return program;
}



function convolveGL(image, canvas) {

	console.time('convolve on GPU')
	
	var gl = canvas.getContext("webgl");

  // setup GLSL program
	console.time('compile time')
  var program= createProgram(gl, vertexShader, fragmentShader)
  console.timeEnd('compile time')

  // look up where the vertex data needs to go.
  var positionLocation = gl.getAttribLocation(program, "a_position");
  var texcoordLocation = gl.getAttribLocation(program, "a_texCoord");

  // Create a buffer to put three 2d clip space points in
  var positionBuffer = gl.createBuffer();

  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  
  // Set a rectangle the same size as the image.
  setRectangle(gl, 0, 0, image.width, image.height);

  // provide texture coordinates for the rectangle.
  var texcoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  	0.0,  0.0,
  	1.0,  0.0,
  	0.0,  1.0,
  	0.0,  1.0,
  	1.0,  0.0,
  	1.0,  1.0,
  	]), gl.STATIC_DRAW);

  // Create a texture.
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set the parameters so we can render any size image.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

console.time('upload texture')
  // Upload the image into the texture.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
console.timeEnd('upload texture')

  // lookup uniforms
  var resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  var textureSizeLocation = gl.getUniformLocation(program, "u_textureSize");

  var width= image.width
  var height= image.height
  canvas.width= width
  canvas.height= height

  // Tell WebGL how to convert from clip space to pixels
  gl.viewport(0, 0,  width,  height);

  // Clear the canvas
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  // positionLocation will hold the current position
  gl.enableVertexAttribArray(positionLocation);

  // Bind the position buffer.
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  // Turn on the texcoord attribute
  gl.enableVertexAttribArray(texcoordLocation);

  // Bind the position buffer.
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);

  // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0)

  // set the resolution
  gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);

  // set the size of the image
  gl.uniform2f(textureSizeLocation, image.width, image.height);
 
  console.time('render time')
	// Draw the rectangle (6 vertexes)
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  console.timeEnd('render time')

  console.timeEnd('convolve on GPU')
}

function setRectangle(gl, x, y, width, height) {
	var x1 = x;
	var x2 = x + width;
	var y1 = y;
	var y2 = y + height;
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		x1, y1,
		x2, y1,
		x1, y2,
		x1, y2,
		x2, y1,
		x2, y2,
		]), gl.STATIC_DRAW);
}
