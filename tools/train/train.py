import torch, timm, numpy as np, glob, os, sys, time
from PIL import Image, ImageOps
torch.set_num_threads(2)
CLASSES=['dress','hat','longsleeve','outwear','pants','shirt','shoes','shorts','skirt','t-shirt']
ROOT=sys.argv[1] if len(sys.argv)>1 else 'dscut'
m=timm.create_model('mobilenetv3_large_100',pretrained=False)
m.load_state_dict(torch.load('weights/mobilenetv3_large_100_ra-f55367f5.pth',map_location='cpu')); m.eval()
MEAN=np.array([0.485,0.456,0.406],dtype=np.float32); STD=np.array([0.229,0.224,0.225],dtype=np.float32)
rng=np.random.default_rng(0)
def prep(img, aug):
    if ROOT=='ds':
        img=ImageOps.exif_transpose(img).convert('RGB'); img=ImageOps.pad(img,(256,256),color=(255,255,255))
    if aug:
        if rng.random()<0.5: img=ImageOps.mirror(img)
        s=rng.uniform(0.86,1.0); w=int(256*s); x=rng.integers(0,256-w+1); y=rng.integers(0,256-w+1)
        img=img.crop((x,y,x+w,y+w))
        if rng.random()<0.5: img=img.rotate(rng.uniform(-12,12),fillcolor=(255,255,255),resample=Image.BILINEAR)
    a=np.asarray(img.convert('RGB').resize((224,224),Image.BILINEAR)).astype(np.float32)/255
    return ((a-MEAN)/STD).transpose(2,0,1)
def feats(split, naug):
    X=[];Y=[]
    files=[(f,ci) for ci,c in enumerate(CLASSES) for f in sorted(glob.glob(f'{ROOT}/{split}/{c}/*.jpg'))]
    for rep in range(naug+1):
        for i in range(0,len(files),64):
            b=files[i:i+64]
            x=torch.from_numpy(np.stack([prep(Image.open(f),rep>0) for f,_ in b]))
            with torch.no_grad(): f=m.forward_head(m.forward_features(x),pre_logits=True)
            X.append(f.numpy()); Y+= [c for _,c in b]
    return np.concatenate(X),np.array(Y)
t=time.time()
Xtr,Ytr=feats('train',2); Xva,Yva=feats('validation',0); Xte,Yte=feats('test',0)
print('feats',Xtr.shape,Xva.shape,Xte.shape,round(time.time()-t),'s',flush=True)
np.savez(f'feats_{ROOT}.npz',Xtr=Xtr,Ytr=Ytr,Xva=Xva,Yva=Yva,Xte=Xte,Yte=Yte)
