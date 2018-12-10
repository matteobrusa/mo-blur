"use strict"

var image 
var source  // ImageData of image
var canvasCPU, canvasGPU  
//var context  // 2d context of canvas
var kernel
var center
var filename= "test.jpg"
 

var splinePoints=64
var scale= 1
var maxImageSize= 1600

var textSpline 
var textScale
var textSplinePoints
var checkboxGpu

var useGpu= true

function onload() { 

    canvasCPU= document.getElementById("mainCPU")
	canvasGPU= document.getElementById("mainGPU")

    document.addEventListener("dragover", handleDragover, true);
    document.addEventListener('drop', handleDrop, true)

	checkboxGpu= document.getElementById("gpu")
	textSpline= document.getElementById("textSpline")
	textScale= document.getElementById("textScale")
	textSplinePoints= document.getElementById("textSplinePoints")
	 
	checkboxGpu.addEventListener("change", function(){
		useGpu= this.checked 
		doIt()		
	}) 
    textSpline.addEventListener("keyup", updateParams)
	textScale.addEventListener("keyup", updateParams)
	textSplinePoints.addEventListener("keyup", updateParams)

     

	image = new Image();

	image.onload = function () {

		source= getData(image)

		var w= image.width
		var h= image.height

		console.log("image: "+ w+"x"+h)

		canvasGPU.width= canvasCPU.width= w
		canvasGPU.height= canvasCPU.height= h 

		getCVfromURL()

		doIt()
	}

	image.src = 'test.jpg'
}

function getCanvas(w,h) {
  var c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function getData(img){
  var c = getCanvas(img.width, img.height);
  var ctx = c.getContext('2d')
  ctx.drawImage(img,0,0)
  return ctx.getImageData(0,0,c.width,c.height)
}

function getCVfromURL(){

    var spline= new URLSearchParams(window.location.search).get("spline")
    if (!spline) return
    
    parseSpline(spline)

	var s= new URLSearchParams(window.location.search).get("scale")
	if (s)
    	scale= Number(s)
    
    s= new URLSearchParams(window.location.search).get("maxImageSize")
	if (s)
    	maxImageSize= Number(s)

    s= new URLSearchParams(window.location.search).get("splinePoints")
	if (s)
    	splinePoints= Number(s)
    	
}

function parseSpline(spline) {
	cv=[]
    var points= spline.split("_")
    for (const p of points){
        var s=p.split(",")
        cv.push([parseInt(s[0]), parseInt(s[1])])
    }
}

function cvToString() {
	var spline=""
    for (const p of cv){
        spline+= parseInt(p[0]) + "," + parseInt(p[1]) + "_"
    } 
    
    return spline.substring(0,spline.length-1)
}

function setCVinURL(){
    var spline= cvToString()

    var newurl = window.location.protocol + "//" + window.location.host 
               + window.location.pathname 
               + "?spline=" + spline 
               + "&scale=" + scale
               + "&maxImageSize=" + maxImageSize
               + "&splinePoints=" + splinePoints
 
    history.pushState({},"Mo' Blur",newurl)

    textSpline.value= spline
    textScale.value= scale
	textSplinePoints.value= splinePoints
}

function updateParams(event) {
 
    event.preventDefault();
    if (event.keyCode === 13) {

		parseSpline(textSpline.value)
		scale= Number(textScale.value)
		splinePoints= Number(textSplinePoints.value)

		doIt()
    }
}

function handleDragover(e) {
	e.preventDefault();
}
function handleDrop(e) {
  e.preventDefault();

  let dt = e.dataTransfer
  let files = dt.files

	
  loadImage(files[0])
}

function loadImage(file, source) {

	filename= file.name
	console.log("scaling " + filename);

	var reader = new FileReader();
	reader.onload = function(e) {

		scaleAndUploadImageFromUrl(e.target.result);

	};
	reader.readAsDataURL(file);
}

function scaleAndUploadImageFromUrl(url) {

	image = new Image();
	image.onload = function() {
        
        var w= image.width
        var h= image.height

		if (h > maxImageSize) {
			w*= maxImageSize / h;
			h= maxImageSize;
		}
		if (w > maxImageSize) {
			h *= maxImageSize / w;
			w = maxImageSize;
		}
      
        if (w<image.width)
          console.log("scaling down to "+w+"x"+h)

		var c= document.createElement('canvas')
		var ctx= c.getContext("2d");
		canvasCPU.width= canvasGPU.width= c.width= image.width= w;
		canvasCPU.height= canvasGPU.height= c.height= image.height= h;
		ctx.drawImage(image, 0, 0, w, h)

		source= ctx.getImageData(0,0,w,h)

 
		doIt()
	};
	image.src = url;
}

function loadNext(){

  cv=vips[item++]
   
  doIt()
}

function save() {

	canvasGPU.toBlob(function(blob){
	console.log(blob)
	var a= document.createElement("a")
		a.href = URL.createObjectURL(blob);
		a.download= "blur_"+filename

		a.click()
	}, "image/jpeg",0.88); 
}

function rotate(degrees) {
	var rads= degrees*Math.PI*2/360

	for (const p of cv) {
		var np= rotatePoint(p, rads)
		p[0]=np[0]
		p[1]=np[1]

	}
	
	doIt()
}

function rotatePoint(p,rads) {

	var x= p[0], y= p[1]
	var c= Math.cos(rads)
	var s= Math.sin(rads)

	return [x*c - y*s, y*c + x*s]
}


//////////////////////////////////////////////////////////////////////////
///
///  convolve
///
//////////////////////////////////////////////////////////////////////////

function doIt() {
	kernel= getKernel()
	updateKernelCanvas(kernel)


	if (useGpu)	{
		canvasCPU.style.display= "none"
		canvasGPU.style.display= "block"
		convolveGL(image, canvasGPU)		
	}
	else {
		canvasCPU.style.display= "block"
		canvasGPU.style.display= "none"
		convolveCPU(canvasCPU) 
	}
}
 
function convolveCPU(canvas) {

  console.time('convolve on CPU')

  var context = canvas.getContext('2d');

  var w= source.width
  var h= source.height

  var dst= new ImageData(w, h)

  for (var c=0; c<w*h*4; c=c+4){

    var r=0,g=0,b=0
    for (const tuple of kernel){

      var x= tuple[0]
      var y= tuple[1]
      var intensity= tuple[2]


      var o=  (x + y*w) *4
      r+= source.data[c+o]*intensity
      g+= source.data[c+o+1]*intensity
      b+= source.data[c+o+2]*intensity
    }

    var nr= r/256
    var ng= g/256
    var nb= b/256

    dst.data[c]= nr
    dst.data[c+1]= ng
    dst.data[c+2]= nb
    dst.data[c+3]= 255

  }

  context.putImageData(dst,0,0)

  console.timeEnd('convolve on CPU')
}

var item= 0
var cv

//////////////////////////////////////////////////////////////////////////
///
///  kernel stuff
///
//////////////////////////////////////////////////////////////////////////

function getKernel(){

//  var cv= [getRandomPoint(scale),getRandomPoint(scale),getRandomPoint(scale),getRandomPoint(scale)]
  
  if (!cv) {
    cv=vips[item++]
  }

  console.log("cv: "+cvToString())

  setCVinURL()

  var count= parseInt( splinePoints* scale)
  
  var cv2= []
  for (const p of cv){
    cv2.push([p[0] * -scale, p[1]* -scale]) 
  }

  var increment= 256/count
  var map={}
  var avgx=0, avgy=0

  // get the spline points into an intensity map

  for(var t=0; t<count; t++) {
    //var point = spline.calcAt(t/count)
    var point= interpolate(t/count, 2, cv2)
    var x= point[0]
    var y= point[1]
    
    avgx+= x
    avgy+= y

    point=[parseInt(x), parseInt(y)]

    if (map[point]){
      map[point]+= increment 
    }
    else{
      map[point]= increment  
    }
  }

  avgx= parseInt(avgx/count)
  avgy= parseInt(avgy/count)

  center= [avgx, avgy]
   
  // reformat the map as list, recenter

  var res=[]
  for (const key in map){

      var intensity= map[key]
      var s= key.split(",")
      var x= parseInt(s[0]) - avgx
      var y= parseInt(s[1]) - avgy
      res.push([x,y,intensity])
  }

  return res
}

function updateKernelCanvas(kernel){

  var intensity=0
  var minx=12345, miny=12345 
  var maxx=-12345, maxy=-12345

  for (const tuple of kernel){  
    
    var x= tuple[0]  
    var y= tuple[1] 
    intensity+= tuple[2]
    if (x<minx) 
      minx= x
    if (y<miny) 
      miny= y
    if (x>maxx) 
      maxx= x
    if (y>maxy) 
      maxy=y
  }

  var kw= maxx-minx+1
  var kh= maxy-miny+1

  console.log("kernel points: "+ Object.keys(kernel).length+
              "   intensity: "+ intensity + 
              "   size: "+ kw+","+kh)


  // draw the kernel on the canvas
  
  var c= document.getElementById("kernel")
  c.width= kw
  c.height= kh
 
  var ctx= c.getContext('2d')

  ctx.fillStyle = "rgba(0,0,0,0.3)"
  ctx.fillRect( 0, 0, kw, kh)

  var data= ctx.getImageData(0,0,kw,kh)


  for (const tuple of kernel){
    
    var x= kw - 1 -(tuple[0] - minx)
    var y= kh - 1 -(tuple[1] - miny)
    var intensity= tuple[2]
    
    var hi= Math.tanh(intensity*44/256)*256

    data.data[4*(x+kw*y)]= hi 
    data.data[1+4*(x+kw*y)]= hi 
    data.data[2+4*(x+kw*y)]= hi
    data.data[3+4*(x+kw*y)]= 255
  }

  ctx.putImageData(data,0,0)

  c.style.width= kw*6/scale
  c.style.height= kh*6/scale
}

var vips= [
[[6,48]
,[6,44]
,[5,65]
,[0,88]],
[[-9,43]
,[-10,46]
,[-15,61]
,[-29,82]],
[[62.29016949,74.17869893]
,[79.51935656,94.24502838]
,[55.98985747,92.23249967]
,[22.90052283,46.56226544]],
[[32.38327648,15.08491739]
,[65.0934473,7.24362867]
,[53.58820043,36.56889169]
,[5.79989248,50.74357332]],
[[46.30073578,37.33119314]
,[13.85394125,86.656185,]
,[0.64350541,50.27820801]
,[89.829797,8.08146472]],
[[45.23795535,55.97723861]
,[92.4210584,46.56500701]
,[50.78412731,58.73848288]
,[18.46603439,51.1908639,]],
[[96.52421416,1.16546938]
,[73.59916198,15.80127248]
,[98.63394517,1.68806542]
,[87.94912681,68.13506644]],
[[36.15227749,48.04806656]
,[41.69526266,44.67592538]
,[40.95157299,65.77058264]
,[25.88553819,63.49959241]],
[[90.56396762,68.6254157,]
,[76.65092564,90.46162378]
,[25.98274475,63.57258696]
,[90.49456947,87.21303741]],
[[71.23429878,83.97997363]
,[18.2591887,99.82826275]
,[19.40954787,67.08867303]
,[9.17866134,75.77369809]],
[[74.72912662,20.27526323]
,[20.51586541,60.07571261]
,[5.67572871,77.63286006]
,[76.44111475,4.17362804]],
[[54.81190538,34.58318233]
,[84.48510886,28.85974354]
,[51.03450263,34.38142791]
,[41.5493928,97.38587963]],
[[3.28700521e+01,9.83213917e+01]
,[9.59247535e+01,9.18324440e+01]
,[7.89905632e+01,8.75066624e+01]
,[4.02774681e-02,6.26989053e+01]],
[[3.85518393,69.62243226]
,[14.39332214,46.25322548]
,[67.16467641,79.29512717]
,[45.31892285,49.82722298]],
[[88.82680765,39.9994396,]
,[58.86201828,85.97866735]
,[22.85392034,51.5717284,]
,[58.37304856,94.7199522,]],
[[35.18462558,43.0186246,]
,[45.36708636,34.34697409]
,[51.24443649,39.24154015]
,[4.09087225,41.85326074]],
[[54.81578284,13.18914634]
,[71.15468423,30.22500559]
,[93.83252748,19.27183473]
,[76.19850072,16.56415474]],
[[6.68839763,41.32428164]
,[11.05047339,75.21114614]
,[51.12851099,4.96739945]
,[4.48074844,73.59343862]],
[[24.35177627,50.22089895]
,[16.19375143,82.12222158]
,[23.13995125,55.23286406]
,[92.63574248,39.73787542]],
[[30.78067547,57.79578772]
,[26.56180354,80.78960514]
,[46.7217221,33.25198067]
,[89.67525962,79.24119899]],
[[7.34266548,59.43619291]
,[98.94469618,34.39841546]
,[54.39742924,37.43404322]
,[73.96024817,68.54638158]],
]
