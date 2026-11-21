// WebCodecs supplies RGB-convertible VideoFrames. The software decoder supplies
// three YUV planes for colour and the original full-range luma plane for alpha.
export function createActorRenderer(canvas, width, height, planar) {
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl', {alpha:true, premultipliedAlpha:true, antialias:false, depth:false, stencil:false});
  if (!gl && planar) return softwareCanvas(canvas, width, height);
  if (!gl) throw Error('No actor compositor');
  const shaders = [], textures = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  function shader(type, source) {
    const part = gl.createShader(type);
    shaders.push(part);
    gl.shaderSource(part, source);
    gl.compileShader(part);
    if (!gl.getShaderParameter(part, gl.COMPILE_STATUS)) throw Error('Actor shader unavailable');
    gl.attachShader(program, part);
  }
  let draw, verified = false;
  function dispose() {
    for (const texture of textures) gl.deleteTexture(texture);
    for (const part of shaders) gl.deleteShader(part);
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  try {
    shader(gl.VERTEX_SHADER, `
      attribute vec2 xy;
      varying vec2 uv;
      void main() {
        uv = vec2((xy.x + 1.) * .5, (1. - xy.y) * .5);
        gl_Position = vec4(xy, 0., 1.);
      }`);
    const read = planar ? `
      float y = (texture2D(t0, uv*s0).r - 16./255.) * (255./219.);
      float u = texture2D(t1, uv*s1).r - 128./255.;
      float v = texture2D(t2, uv*s1).r - 128./255.;
      vec3 rgb = clamp(vec3(y+1.596*v, y-.392*u-.813*v, y+2.017*u), 0., 1.);
      float a = texture2D(t3, uv*sa).r;` : `
      vec3 rgb = texture2D(t0, uv).rgb;
      float a = texture2D(t1, uv*sa).r;`;
    shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D t0, t1, t2, t3;
      uniform vec2 s0, s1, sa;
      void main() {
        ${read}
        gl_FragColor = vec4(rgb*a, a);
      }`);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Actor shader link failed');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const xy = gl.getAttribLocation(program,'xy');
    gl.enableVertexAttribArray(xy);
    gl.vertexAttribPointer(xy,2,gl.FLOAT,false,0,0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    for (let i=0;i<(planar?4:2);i++) {
      gl.activeTexture(gl.TEXTURE0+i);
      const texture=gl.createTexture();
      textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      for(const [name,value] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],
        [gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])
        gl.texParameteri(gl.TEXTURE_2D,name,value);
      gl.uniform1i(gl.getUniformLocation(program,'t'+i),i);
    }
    const scales=['s0','s1','sa'].map(k=>gl.getUniformLocation(program,k));
    function plane(index, data, rows) {
      gl.activeTexture(gl.TEXTURE0+index);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,data.stride,rows,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,data.bytes);
    }
    function video(index, frame) {
      gl.activeTexture(gl.TEXTURE0+index);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,frame);
    }
    draw = ({color,alpha})=>{
      if(gl.isContextLost()) throw Error('Lost actor compositor');
      if (planar) {
        const f=color.format, a=alpha.format;
        gl.uniform2f(scales[0],width/color.y.stride,height/f.height);
        gl.uniform2f(scales[1],Math.ceil(width/2)/color.u.stride,Math.ceil(height/2)/f.chromaHeight);
        gl.uniform2f(scales[2],width/alpha.y.stride,height/a.height);
        plane(0,color.y,f.height); plane(1,color.u,f.chromaHeight); plane(2,color.v,f.chromaHeight); plane(3,alpha.y,a.height);
      } else {
        video(0,color);
        gl.uniform2f(scales[2],width/alpha.stride,1);
        plane(1,alpha,height);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      if (!verified) {
        const pixel = new Uint8Array(4);
        gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        if (pixel[3]>32) throw Error('Opaque actor background');
        gl.readPixels(width>>1,height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        if (pixel[3]<64) throw Error('Empty actor frame');
        verified = true;
      }
    };
  } catch(error) { dispose(); throw error; }
  return {draw, dispose};
}

function softwareCanvas(canvas, width, height) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('No actor canvas');
  const frame = ctx.createImageData(width,height);
  const data = frame.data;
  return {dispose(){},draw({color,alpha}){
    for (let row=0;row<height;row++) {
      const yOffset=row*color.y.stride, aOffset=row*alpha.y.stride;
      const uOffset=(row>>1)*color.u.stride, vOffset=(row>>1)*color.v.stride;
      let dst=row*width*4;
      for (let x=0;x<width;x++,dst+=4) {
        const a=alpha.y.bytes[aOffset+x];
        data[dst+3]=a;
        if (!a) continue;
        const y=1.164*(color.y.bytes[yOffset+x]-16);
        const u=color.u.bytes[uOffset+(x>>1)]-128, v=color.v.bytes[vOffset+(x>>1)]-128;
        data[dst]=y+1.596*v;
        data[dst+1]=y-.392*u-.813*v;
        data[dst+2]=y+2.017*u;
      }
    }
    ctx.putImageData(frame,0,0);
  }};
}
