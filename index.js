"use strict";

var source
var canvas  
var context

const splinePoints=64
const scale= 1

function onload() {
    
//    var cw= canvas.width
//    var ch= canvas.height
    canvas= document.getElementById("main")

    if (canvas.getContext) {

        context = canvas.getContext('2d');

        var img = new Image();
        img.src = 'test.jpg';

        //drawing of the test image - img1
        img.onload = function () {
            //draw background image


        source= getData(img)

        var w= img.width
        var h= img.height

        console.log("image: "+ w+"x"+h)

        canvas.width= w
        canvas.height= h 

        doBlur() 


//            ctx.drawImage(img, 0, 0)


        };
    }
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

function getImageData(width, height){
  
}

function updateKernelCanvas(kernel){

  var intensity=0
  var minx=12345, miny=12345 
  var maxx=0, maxy=0

  for (const tuple of kernel){  
    
    var x= tuple[0]  
    var y= tuple[1] 
    var intensity= tuple[2]
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




  var c= document.getElementById("kernel")
  c.width= kw
  c.height= kh
//  getCanvas(kw, kh);
  var ctx= c.getContext('2d')

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect( 0, 0, kw, kh);

  var data= ctx.getImageData(0,0,kw,kh)


  for (const tuple of kernel){
    
    var x= kw- 1-(tuple[0] -minx)
    var y= kh-1-(tuple[1] -miny)
    var intensity= tuple[2]

    
    var hi= Math.tanh(intensity*64/256)*256

    data.data[4*(x+kw*y)]= hi 
    data.data[1+4*(x+kw*y)]= hi 
    data.data[2+4*(x+kw*y)]= hi
    data.data[3+4*(x+kw*y)]= 255
  }

  ctx.putImageData(data,0,0)

  c.style.width= kw*4
  c.style.height= kh*4
}

function doBlur() {

  console.time('doBlur');

  var kernel= getKernel(scale, splinePoints)
  updateKernelCanvas(kernel)

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

  console.timeEnd('doBlur')
}


var seed = 1;
function random() {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}


function getRandomPoint(scale){
    var ar=4
  return [Math.random()*scale, Math.random()*scale*ar]
}


var item=0
var cv

function getCVfromURL(){

    var spline= new URLSearchParams(window.location.search).get("spline")
    if (!spline) return
    
    cv=[]
    var points= spline.split(",")
    for (const p of points){
        var s=p.split("-")
        cv.push([parseInt(s[0]), parseInt(s[1])])
    }
}

function setCVinURL(){
    var s=""
    for (const p of cv){
        s+= parseInt(p[0]) + "-" + parseInt(p[1]) + ","
    } 
    
    s=s.substring(0,s.length-1)

    var newurl = window.location.protocol + "//" + window.location.host 
               + window.location.pathname + "?spline="+s;
    history.pushState({},"Mo' Blur",newurl)
}

function getKernel(scale, count){

//  var cv= [getRandomPoint(scale),getRandomPoint(scale),getRandomPoint(scale),getRandomPoint(scale)]
  getCVfromURL()
  if (!cv) {
    cv=vips[item++]
    setCVinURL()
  }
  
  var cv2= []
  for (const p of cv){
    cv2.push([p[0] * -scale, p[1]* -scale]) 
  }

  var increment= 256/count

  var map={}
  //var spline = new BSpline(cv,3,true)
    for(var t=0; t<count; t++) {
      //var point = spline.calcAt(t/count)
      var point= interpolate(t/count, 2, cv2)
      if (map[point]){
        map[point]+= increment 
      }
      else{
        map[point]= increment  
      }
    }
  
  console.log(map)

  var res=[]
  for (const key in map){

      var intensity= map[key]
      var s= key.split(",")
      var x= parseInt(s[0])
      var y= parseInt(s[1])
      res.push([x,y,intensity])
  }
  
  
  return res
}


var vips= [
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
