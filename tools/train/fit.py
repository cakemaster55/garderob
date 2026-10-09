import numpy as np, sys
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import confusion_matrix
CLASSES=['dress','hat','longsleeve','outwear','pants','shirt','shoes','shorts','skirt','t-shirt']
d=np.load(sys.argv[1] if len(sys.argv)>1 else 'feats_dscut.npz')
sc=StandardScaler().fit(d['Xtr'])
best=None
for C in [0.003,0.01,0.03,0.1,0.3]:
    lr=LogisticRegression(C=C,max_iter=300).fit(sc.transform(d['Xtr']),d['Ytr'])
    va=lr.score(sc.transform(d['Xva']),d['Yva']); te=lr.score(sc.transform(d['Xte']),d['Yte'])
    print(C,'val',round(va,4),'test',round(te,4),flush=True)
    if best is None or va>best[0]: best=(va,C,lr)
va,C,lr=best
print('best C',C)
P=lr.predict(sc.transform(d['Xte']))
print(confusion_matrix(d['Yte'],P))
G={'dress':'dress','hat':'acc','longsleeve':'top','outwear':'outer','pants':'bottom','shirt':'top','shoes':'shoes','shorts':'bottom','skirt':'bottom','t-shirt':'top'}
g=np.array([G[c] for c in CLASSES])
print('group-level test acc', round((g[P]==g[d['Yte']]).mean(),4))
# fold the scaler into the linear layer: logits = W((x-mu)/sd)+b
W=lr.coef_/sc.scale_; b=lr.intercept_-(lr.coef_*sc.mean_/sc.scale_).sum(1)
np.savez('head.npz',W=W.astype(np.float32),b=b.astype(np.float32))
