# Build "cutout on white, square" versions of the dataset, mimicking the in-browser pipeline.
import onnxruntime as ort, numpy as np, glob, os, sys, cv2
from PIL import Image, ImageOps
from multiprocessing import Pool
MEAN=np.array([0.485,0.456,0.406],dtype=np.float32); STD=np.array([0.229,0.224,0.225],dtype=np.float32)
sess=None
def init():
    global sess
    so=ort.SessionOptions(); so.intra_op_num_threads=1
    sess=ort.InferenceSession('models/u2netp.onnx',so,providers=['CPUExecutionProvider'])
def smooth(m,a=0.2,b=0.8):
    t=np.clip((m-a)/(b-a),0,1); return t*t*(3-2*t)
def cutout(img, size=256):
    """img: PIL RGB (work size). returns PIL RGB square cutout on white, or None"""
    a=np.asarray(img.resize((320,320),Image.BILINEAR)).astype(np.float32)
    a=a/max(a.max(),1e-6); a=(a-MEAN)/STD
    o=sess.run(None,{'input.1':a.transpose(2,0,1)[None]})[0][0,0]
    o=(o-o.min())/(o.max()-o.min()+1e-8)
    # drop small specks
    n,lab,stats,_=cv2.connectedComponentsWithStats((o>0.5).astype(np.uint8),connectivity=8)
    if n>1:
        areas=stats[1:,cv2.CC_STAT_AREA]; keep=np.where(areas>=0.04*areas.max())[0]+1
        km=np.isin(lab,keep).astype(np.uint8)
        km=cv2.dilate(km,np.ones((7,7),np.uint8))
        o=o*km
    m=np.asarray(Image.fromarray((o*255).astype(np.uint8)).resize(img.size,Image.BILINEAR)).astype(np.float32)/255
    al=smooth(m)
    ys,xs=np.where(al>0.1)
    if len(xs)<50: return None
    x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
    rgb=np.asarray(img).astype(np.float32)
    comp=(rgb*al[...,None]+255*(1-al[...,None]))[y0:y1,x0:x1].astype(np.uint8)
    pil=Image.fromarray(comp); w,h=pil.size; s=int(max(w,h)*1.08)
    sq=Image.new('RGB',(s,s),(255,255,255)); sq.paste(pil,((s-w)//2,(s-h)//2))
    return sq.resize((size,size),Image.BILINEAR)
def work(f):
    out=f.replace('ds/','dscut/')
    if os.path.exists(out): return 1
    os.makedirs(os.path.dirname(out),exist_ok=True)
    try:
        img=ImageOps.exif_transpose(Image.open(f)).convert('RGB'); img.thumbnail((1024,1024))
        c=cutout(img)
        if c is None:
            c=ImageOps.pad(img,(256,256),color=(255,255,255))
        c.save(out,quality=92); return 1
    except Exception as e:
        print('ERR',f,e); return 0
if __name__=='__main__':
    files=sorted(glob.glob('ds/*/*/*.jpg'))
    with Pool(2,initializer=init) as p:
        r=p.map(work,files,chunksize=20)
    print('done',sum(r),len(files))
