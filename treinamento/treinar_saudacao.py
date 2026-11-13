"""Candidato binário Oi. Pessoa 1 treino, 2 validação, 3 regressão já examinada.

Não ativa o modelo na extensão. O teste INES fica separado deste ajuste.
"""
import json,os,copy
from pathlib import Path
import numpy as np
import torch
torch.set_num_threads(4)
torch.manual_seed(20261113)
pasta=Path(os.environ['TEMP'])/'libras-oi'
dados=json.loads((pasta/'atributos-oi.json').read_text('utf-8'))
treino=[a for a in dados if a['divisao']=='treino']
validacao=[a for a in dados if a['divisao']=='validacao']
x=np.array([a['atributos'] for a in treino],dtype=np.float32)
media=x.mean(0);escala=x.std(0).clip(.1)
xt=torch.tensor((x-media)/escala);yt=torch.tensor([a['y'] for a in treino],dtype=torch.float32)
xv=torch.tensor((np.array([a['atributos'] for a in validacao],dtype=np.float32)-media)/escala)
yv=torch.tensor([a['y'] for a in validacao],dtype=torch.float32)
m=torch.nn.Linear(42,1);opt=torch.optim.AdamW(m.parameters(),lr=.02,weight_decay=.1)
melhor=float('inf');estado=None;epoca_escolhida=0
for e in range(600):
 opt.zero_grad(); logits=m(xt+torch.randn_like(xt)*.04).squeeze(1)
 perda=torch.nn.functional.binary_cross_entropy_with_logits(logits,yt,pos_weight=torch.tensor(float(len(yt)-yt.sum())))
 perda.backward();opt.step()
 with torch.no_grad():
  v=torch.nn.functional.binary_cross_entropy_with_logits(m(xv).squeeze(1),yv,pos_weight=torch.tensor(float(len(yv)-yv.sum()))).item()
 if v<melhor:melhor=v;estado=copy.deepcopy(m.state_dict());epoca_escolhida=e
m.load_state_dict(estado)
modelo={'schema':1,'habilitado':False,'classe':'Oi','lingua':'Libras do Brasil','limite':.7,'media':media.tolist(),'escala':escala.tolist(),'pesos':m.weight.detach().numpy()[0].tolist(),'bias':m.bias.item()}
(pasta/'saudacao-candidato.json').write_text(json.dumps(modelo),encoding='utf-8')
resultados=[]
with torch.no_grad():
 for a in dados:
  confianca=m(torch.tensor((np.array(a['atributos'],dtype=np.float32)-media)/escala)).sigmoid().item()
  resultados.append({'nome':a['nome'],'positivo':bool(a['y']),'divisao':a['divisao'],'confianca':confianca,'aceito':confianca>=modelo['limite']})
relatorio={'epoca_escolhida':epoca_escolhida,'limite':modelo['limite'],'protocolo':__doc__,'resultados':resultados}
(pasta/'saudacao-regressao.json').write_text(json.dumps(relatorio,indent=2),encoding='utf-8')
print(json.dumps({'epoca':epoca_escolhida,'positivos':[r for r in resultados if r['positivo']],'falsos_positivos':[r for r in resultados if not r['positivo'] and r['aceito']]}))
