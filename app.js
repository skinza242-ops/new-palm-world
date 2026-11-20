const video = document.getElementById("video");
const preview = document.getElementById("preview");
const placeholder = document.getElementById("placeholder");
const cameraBtn = document.getElementById("cameraBtn");
const captureBtn = document.getElementById("captureBtn");
const retakeBtn = document.getElementById("retakeBtn");
const gallery = document.getElementById("gallery");
const loading = document.getElementById("loading");
const result = document.getElementById("result");
const statusMessage = document.getElementById("status");
let cameraStream = null;
let scanToken = 0;

const lineGuide = [
  {
    id:"heart", name:"Heart line — love aur jazbaat",
    path:t=>({x:.25+.52*t,y:.51+.025*Math.sin(Math.PI*t)}),
    strong:"Upper-palm ilaqe mein crease jaisa contrast zyada nazar aaya. Riwayati palmistry ise jazbaat ke izhar aur rishton mein khuli guftagu ka symbol samajhti hai.",
    medium:"Upper-palm ilaqe mein kuch contrast nazar aaya, magar line saaf nahi. Riwayati maani ko sirf tafreehi reflection samjhein.",
    weak:"Is photo mein heart-line ilaqa wazeh nahi. Is se kisi ke pyaar, wafadari ya future relationship ka nateeja nahi nikala ja sakta."
  },
  {
    id:"relationship", name:"Relationship lines — love aur shadi",
    path:t=>({x:.78+.16*t,y:.47+.012*Math.sin(Math.PI*t)}),
    strong:"Chhoti ungli ke neeche kinare par crease jaisa contrast mila. Riwayati palmistry isay qurbat aur partnership par reflection ke liye dekhti hai—shadi ka waqt ya nateeja nahi batati.",
    medium:"Kinare wale ilaqe mein halka contrast mila; chhoti relationship lines photo mein theek se judge karna mushkil hota hai.",
    weak:"Relationship-line ilaqa is photo se assess nahi ho saka. Shadi ya relationship ka mustaqbil palm photo se tay nahi hota."
  },
  {
    id:"head", name:"Head line — soch aur seekhna",
    path:t=>({x:.23+.54*t,y:.63-.018*t}),
    strong:"Hatheli ke darmiyan mein crease jaisa contrast nazar aaya. Riwayati palmistry head line ko soch aur faislay ke symbolic reflection se jorti hai.",
    medium:"Darmiyani ilaqe mein contrast halka hai; line ki shakal yaqini taur par alag nahi ki ja saki.",
    weak:"Head-line ilaqa photo mein wazeh nahi. Personality ya salahiyat ka scientific nateeja is scan se nahi nikalta."
  },
  {
    id:"life", name:"Life line — riwayati maani",
    path:t=>({x:.43-.19*Math.sin(Math.PI*t/2),y:.49+.36*t}),
    strong:"Angoothe ke gird wale ilaqe mein crease jaisa contrast nazar aaya. Riwayati palmistry ise zindagi ki raftaar ka symbol kehti hai; yeh umr ya sehat nahi batati.",
    medium:"Angoothe ke gird kuch contrast mila, magar curve saaf nahi. Life line ki lambai se umr maloom nahi hoti.",
    weak:"Life-line ilaqa is photo se assess nahi ho saka. Is se umr ya sehat ki peshgoi mumkin nahi."
  },
  {
    id:"fate", name:"Fate line — kaam aur maqsad",
    path:t=>({x:.53+.012*Math.sin(Math.PI*t),y:.58+.34*t}),
    strong:"Hatheli ke darmiyan mein seedha crease jaisa contrast mila. Riwayati palmistry fate line ko kaam ya maqsad par reflection se jorti hai; career ki guarantee nahi.",
    medium:"Darmiyani vertical ilaqe mein halka contrast mila; fate line wazeh nahi.",
    weak:"Fate-line ilaqa is photo mein clear nahi. Yeh lakeer har haath mein numayan nahi hoti aur iska na dikhna manfi alamat nahi."
  },
  {
    id:"sun", name:"Sun / Apollo line — fun aur khud-izhar",
    path:t=>({x:.68+.008*Math.sin(Math.PI*t),y:.55+.26*t}),
    strong:"Ring-finger ke neeche wale ilaqe mein crease jaisa contrast mila. Riwayati palmistry isay fun aur khud-izhar ke symbolic reflection ke liye dekhti hai.",
    medium:"Ring-finger ke neeche halka contrast mila; is chhoti lakeer ko yaqini taur par pehchanna mushkil hai.",
    weak:"Sun-line ilaqa clear nahi. Is lakeer ka na dikhna creativity ya kamyabi ka faisla nahi karta."
  }
];

function setStatus(message, isError) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", Boolean(isError));
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  video.srcObject = null;
}

function showPhoto(dataUrl) {
  scanToken++;
  preview.src = dataUrl;
  preview.style.display = "block";
  video.style.display = "none";
  placeholder.classList.add("hidden");
  captureBtn.classList.add("hidden");
  cameraBtn.classList.remove("hidden");
  retakeBtn.classList.remove("hidden");
  result.style.display = "none";
  stopCamera();
  analyzePhoto(dataUrl, scanToken);
}

function optimizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Tasveer parhi nahi ja saki."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Yeh tasveer kholi nahi ja saki."));
      image.onload = () => {
        const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Tasveer tayyar nahi ho saki."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function getGray(data, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 1 || py < 1 || px >= data.width - 1 || py >= data.height - 1) return null;
  const index = (py * data.width + px) * 4;
  return .299 * data.data[index] + .587 * data.data[index+1] + .114 * data.data[index+2];
}

function scanPath(data, path, mirror) {
  let totalSignal = 0;
  let visibleSamples = 0;
  let samples = 0;
  const scale = Math.min(data.width, data.height);
  const offset = Math.max(2, scale * .012);
  for (let t=.04;t<=.96;t+=.025) {
    const before = path(Math.max(0,t-.01));
    const after = path(Math.min(1,t+.01));
    const point = path(t);
    const x = (mirror ? 1-point.x : point.x) * data.width;
    const y = point.y * data.height;
    const dx = (mirror ? -(after.x-before.x) : after.x-before.x) * data.width;
    const dy = (after.y-before.y) * data.height;
    const length = Math.hypot(dx,dy) || 1;
    const nx = -dy/length;
    const ny = dx/length;
    const center = getGray(data,x,y);
    const sideA = getGray(data,x+nx*offset,y+ny*offset);
    const sideB = getGray(data,x-nx*offset,y-ny*offset);
    if (center === null || sideA === null || sideB === null) continue;
    const contrast = (sideA+sideB)/2-center;
    totalSignal += Math.max(0,contrast-3);
    if (contrast > 8) visibleSamples++;
    samples++;
  }
  if (!samples) return 0;
  const meanSignal = totalSignal/samples;
  const continuity = visibleSamples/samples;
  return Math.round(Math.min(100,meanSignal*2.7+continuity*50));
}

function buildReading(data) {
  const scores = lineGuide.map(line => {
    const score = scanPath(data,line.path,document.getElementById("hand").value==="left");
    const tier = score >= 42 ? "strong" : score >= 19 ? "medium" : "weak";
    return {id:line.id,name:line.name,score,observation:line[tier]};
  });
  const total = data.width*data.height;
  let brightness = 0;
  for(let i=0;i<data.data.length;i+=16) {
    brightness += .299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2];
  }
  brightness /= Math.ceil(total/4);
  const lighting = brightness < 48 ? "Photo andheri hai; roshni behtar karne se scan sudhar sakta hai."
    : brightness > 220 ? "Photo bohat roshan hai; glare kam karne ki koshish karein."
    : "Basic lighting check theek hai.";
  return {scores,lighting};
}

function renderReading(reading) {
  document.getElementById("mainText").textContent =
    reading.lighting + " Yeh sirf photo ke kuch ilaqon ka contrast scan hai; actual lines ki pehchan ki guarantee nahi.";
  const output = document.getElementById("lineResults");
  output.replaceChildren();
  reading.scores.forEach(line => {
    const article = document.createElement("article");
    article.className = "line-card";
    const heading = document.createElement("h3");
    heading.textContent = line.name;
    const meaning = document.createElement("p");
    meaning.textContent = line.observation;
    const measure = document.createElement("p");
    measure.className = "measure";
    measure.textContent = "Rough ilaqai contrast score: " + line.score + "/100 (AI confidence ya accuracy nahi).";
    article.append(heading,meaning,measure);
    output.appendChild(article);
  });
}

function analyzePhoto(dataUrl, token) {
  loading.style.display = "block";
  result.style.display = "none";
  setStatus("Photo isi browser mein scan ho rahi hai...",false);
  const image = new Image();
  image.onerror = () => {
    if (token !== scanToken) return;
    loading.style.display = "none";
    setStatus("Photo process nahi ho saki. JPEG, PNG ya WEBP tasveer try karein.",true);
  };
  image.onload = () => {
    if (token !== scanToken) return;
    const canvas = document.getElementById("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d",{willReadFrequently:true});
    if (!context) {
      loading.style.display = "none";
      setStatus("Local image scan shuru nahi ho saka.",true);
      return;
    }
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const reading = buildReading(context.getImageData(0,0,canvas.width,canvas.height));
    renderReading(reading);
    loading.style.display = "none";
    result.style.display = "block";
    setStatus("Reading isi ek photo se tayyar hui. Photo device se bahar nahi bheji gayi.",false);
    result.scrollIntoView({behavior:"smooth",block:"start"});
  };
  image.src = dataUrl;
}

cameraBtn.addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Is browser mein camera dastiyab nahi. Gallery se photo chunein, ya page ko HTTPS/localhost par kholein.",true);
    return;
  }
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    video.srcObject = cameraStream;
    video.style.display = "block";
    preview.style.display = "none";
    placeholder.classList.add("hidden");
    cameraBtn.classList.add("hidden");
    retakeBtn.classList.add("hidden");
    captureBtn.classList.remove("hidden");
    setStatus("",false);
  } catch(error) {
    console.error("Camera access failed:",error);
    setStatus("Camera nahi khul saka. Permission check karein ya gallery se photo chunein.",true);
  }
});

captureBtn.addEventListener("click",() => {
  if (!video.videoWidth || !video.videoHeight) {
    setStatus("Camera abhi tayyar nahi. Ek lamha ruk kar dobara koshish karein.",true);
    return;
  }
  const canvas = document.getElementById("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    setStatus("Photo tayyar nahi ho saki. Gallery se photo chunein.",true);
    return;
  }
  context.drawImage(video,0,0,canvas.width,canvas.height);
  const scale = Math.min(1,1000/Math.max(canvas.width,canvas.height));
  const small = document.createElement("canvas");
  small.width = Math.max(1,Math.round(canvas.width*scale));
  small.height = Math.max(1,Math.round(canvas.height*scale));
  const smallContext = small.getContext("2d");
  if (!smallContext) {
    setStatus("Photo tayyar nahi ho saki. Dobara koshish karein.",true);
    return;
  }
  smallContext.drawImage(canvas,0,0,small.width,small.height);
  showPhoto(small.toDataURL("image/jpeg",.86));
});

gallery.addEventListener("change",async () => {
  const file = gallery.files && gallery.files[0];
  if (!file) return;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>12*1024*1024) {
    setStatus("JPEG, PNG ya WEBP image chunein jo 12 MB se chhoti ho.",true);
    gallery.value="";
    return;
  }
  try {
    setStatus("Photo tayyar ho rahi hai...",false);
    showPhoto(await optimizeImage(file));
  } catch(error) {
    console.error("Image preparation failed:",error);
    setStatus(error.message || "Photo tayyar nahi ho saki.",true);
  }
});

retakeBtn.addEventListener("click",() => {
  scanToken++;
  preview.removeAttribute("src");
  preview.style.display="none";
  placeholder.classList.remove("hidden");
  retakeBtn.classList.add("hidden");
  cameraBtn.classList.remove("hidden");
  gallery.value="";
  result.style.display="none";
  loading.style.display="none";
  setStatus("",false);
});

window.addEventListener("pagehide",stopCamera);
