"""Generate numerical references by executing reviewed upstream scalar routines.

Usage: python scripts/generate_normalization_fixtures.py EVO2HIC HICFOUNDATION
The output is a small, dependency-free fixture used in GitHub Pages CI.
"""
import ast
import hashlib
import json
import sys
from pathlib import Path
import numpy as np

evo_path=Path(sys.argv[1])/'dataset/normalizer.py'
foundation_path=Path(sys.argv[2])/'data_processing/finetune_dataset.py'
tree=ast.parse(evo_path.read_text())
cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Normalizer')
scope={'np':np};exec(compile(ast.Module(body=[cls],type_ignores=[]),str(evo_path),'exec'),scope)
tree=ast.parse(foundation_path.read_text());cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Finetune_Dataset')
rgb=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='convert_rgb')
exec(compile(ast.Module(body=[rgb],type_ignores=[]),str(foundation_path),'exec'),scope)

n=6
counts=np.array([0,1,5,9,10,11,99,100,101,999,1000,1001,4999,5000,10000,1000000,2,7,10,5000,1],dtype=np.float32)
i,j=np.triu_indices(n);matrix=np.zeros((n,n),dtype=np.float32);matrix[i,j]=counts;matrix[j,i]=counts
map_data={'n':n,'v':[1]*n,'index':(i*n+j).tolist(),'counts':counts.astype(int).tolist()}
fixtures=[]
for denominator,max_reads in [(10,5000),(100,100000),(7.5,1000)]:
    expected=scope['Normalizer']('mixed',max_reads=max_reads,denominator=denominator).normalize(matrix).clip(max=1).astype(np.float32)
    fixtures.append({'method':'evo2hic','map':map_data,'options':{'denominator':denominator,'maxReads':max_reads},'expected':expected[i,j].tolist()})
for task in ['finetune','loops','enhance100','enhanceMax','singlecell']:
    a=matrix.copy()
    if task in ['enhance100','enhanceMax']:np.fill_diagonal(a,0)
    cutoff=1000 if task=='loops' else 100 if task in ['enhance100','singlecell'] else None
    if cutoff is not None:a=np.minimum(a,cutoff)
    maximum=cutoff if cutoff is not None else a.max()
    logs=np.log10(a+1);max_log=np.log10(maximum+1)
    q=(logs/max_log).astype(np.float32)
    rgb=scope['convert_rgb'](None,logs,max_log)
    channels=((rgb-np.array([.485,.456,.406],dtype=np.float32))/np.array([.229,.224,.225],dtype=np.float32)).astype(np.float32)
    fixtures.append({'method':'hicfoundation','map':map_data,'options':{'foundationTask':task},'expected':q[i,j].tolist(),'standardizedRGB':channels[i,j].tolist()})
output={'source_hashes':{str(evo_path.name):hashlib.sha256(evo_path.read_bytes()).hexdigest(),str(foundation_path.name):hashlib.sha256(foundation_path.read_bytes()).hexdigest()},'fixtures':fixtures}
path=Path(__file__).parent/'normalization-reference-fixtures.json';path.write_text(json.dumps(output,indent=2)+'\n')
print(f'Generated {len(fixtures)} upstream reference fixtures.')
