"""Compare JS target values with the actual upstream Hi-Compass functions."""
import ast
import json
import logging
import subprocess
import sys

import numpy as np
from skimage import exposure

tree=ast.parse(open(sys.argv[1]).read())
band=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='band_percentiles')
cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='HiCNormalizer')
stretch=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='_stretch_chromosome')
stretch.decorator_list=[]
scope={'np':np,'exposure':exposure,'logger':logging.getLogger('test')}
exec(compile(ast.Module(body=[band,stretch],type_ignores=[]),'<upstream Hi-Compass>','exec'),scope)

rng=np.random.default_rng(284)
fixtures=[]
for kind in ['empty','constant','sparse','dense','outlier']:
    n=16
    upper=np.triu(rng.integers(0,18,(n,n))).astype(float)
    if kind=='empty':upper[:]=0
    if kind=='constant':upper[:]=1;upper=np.triu(upper)
    if kind=='sparse':upper[rng.random((n,n))<.95]=0
    if kind=='outlier':upper[0,-1]=1000000
    matrix=upper+upper.T-np.diag(np.diag(upper))
    matrix[np.abs(np.arange(n)[:,None]-np.arange(n))<=1]=0
    low,high=scope['band_percentiles'](matrix,1000,2500000,2,99)
    if not high>low:
        nz=np.triu(matrix);nz=nz[nz>0]
        if len(nz):
            low,high=np.percentile(nz,[2,99])
            if not high>low:low,high=0,float(nz.max())
        else:low,high=0,1
    expected=scope['_stretch_chromosome'](np.triu(matrix),low,high,2,99,100)
    ids=np.flatnonzero(upper.ravel());counts=upper.ravel()[ids]
    fixtures.append({'name':kind,'map':{'n':n,'v':[1]*n,'index':ids.tolist(),'counts':counts.tolist()},
                     'spec':{'low':float(low),'high':float(high)},
                     'expected':expected[np.triu_indices(n)].tolist()})
code="""
const fs=require('fs'),F=require('./site/viewer-features.js');
const fixtures=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(fixtures.map(f=>Array.from(F.compassTarget(f.map,f.spec).target))));
"""
actual=json.loads(subprocess.check_output(['node','-e',code],input=json.dumps(fixtures).encode()))
for fixture,values in zip(fixtures,actual):
    np.testing.assert_allclose(values,fixture['expected'],rtol=1e-6,atol=4e-6,err_msg=fixture['name'])
print('Matched upstream Hi-Compass normalization on empty, constant, sparse, dense and outlier matrices; no logarithm.')
