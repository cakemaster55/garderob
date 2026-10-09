import torch, timm, numpy as np, onnx, onnxruntime as ort, glob
from PIL import Image
m=timm.create_model('mobilenetv3_large_100',pretrained=False, exportable=True)
m.load_state_dict(torch.load('weights/mobilenetv3_large_100_ra-f55367f5.pth',map_location='cpu')); m.eval()
h=np.load('head.npz')
class Net(torch.nn.Module):
    def __init__(s):
        super().__init__(); s.m=m; s.head=torch.nn.Linear(1280,10)
        s.head.weight.data=torch.from_numpy(h['W']); s.head.bias.data=torch.from_numpy(h['b'])
    def forward(s,x):
        f=s.m.forward_head(s.m.forward_features(x),pre_logits=True)
        return s.head(f), s.m.classifier(f)
net=Net().eval()
x=torch.randn(1,3,224,224)
torch.onnx.export(net,x,'clothes.onnx',input_names=['image'],output_names=['clothes','imagenet'],opset_version=17,dynamo=False)
import os; print('fp32 size',os.path.getsize('clothes.onnx'))
from onnxconverter_common import float16
mo=onnx.load('clothes.onnx')
m16=float16.convert_float_to_float16(mo,keep_io_types=True)
onnx.save(m16,'clothes16.onnx'); print('fp16 size',os.path.getsize('clothes16.onnx'))
# accuracy check through onnxruntime on the test set
CLASSES=['dress','hat','longsleeve','outwear','pants','shirt','shoes','shorts','skirt','t-shirt']
MEAN=np.array([0.485,0.456,0.406],dtype=np.float32); STD=np.array([0.229,0.224,0.225],dtype=np.float32)
for name in ['clothes.onnx','clothes16.onnx']:
    s=ort.InferenceSession(name,providers=['CPUExecutionProvider']); ok=n=0
    for ci,c in enumerate(CLASSES):
        for f in sorted(glob.glob(f'dscut/test/{c}/*.jpg')):
            a=np.asarray(Image.open(f).convert('RGB').resize((224,224),Image.BILINEAR)).astype(np.float32)/255
            o=s.run(None,{'image':((a-MEAN)/STD).transpose(2,0,1)[None]})
            ok+=int(o[0][0].argmax()==ci); n+=1
    print(name,'test acc',round(ok/n,4))
