import * as C from './src/core/constants.js';
import { Fighter } from './src/combat/fighter.js';
import { Enemy } from './src/ai/enemy.js';
import { CombatSystem } from './src/combat/combat-system.js';
import { dist, angleBetween } from './src/core/utils.js';
const mockP = {sparks(){},blockSpark(){},blood(){},clash(){},execution(){},update(){},particles:[]};
const mockC = {shake(){},update(){}};
const fA = new Fighter(500,400,{color:'#4499ff',team:0,name:'A'});
const eB = new Enemy(650,400,5);
const fB = eB.fighter; fB.name='B';
const aiA = new Enemy(500,400,5); aiA.fighter=fA;
const combat = new CombatSystem(mockP,mockC); const allF=[fA,fB];
let t=0,blocks=0,blockGated=0;
const origGet=eB.getCommands.bind(eB);
for(let i=0;i<3600;i++){t+=1/60;const dt=1/60;
const px={moveX:0,moveY:0,faceAngle:0,lightAttack:false,heavyAttack:false,blockHeld:false,dodge:false,dodgeAngle:0};
const pC=fA.alive&&fB.alive?aiA.getCommands(dt,fB):px;
const eC=fB.alive&&fA.alive?eB.getCommands(dt,fA):px;
if(eC.blockHeld&&fB.state!=='blocking')blocks++;
fA.update(dt,pC,t);if(fB.alive)fB.update(dt,eC,t);
const dx=fB.x-fA.x,dy=fB.y-fA.y,d2=Math.sqrt(dx*dx+dy*dy),m=fA.radius+fB.radius;
if(d2<m&&d2>0.1){const o=(m-d2)/2,nx=dx/d2,ny=dy/d2;fA.x-=nx*o;fA.y-=ny*o;fB.x+=nx*o;fB.y+=ny*o;}
combat.resolve(allF,t,dt);combat.events=[];
if(!fA.alive||!fB.alive)break;}
console.log(`Duration:${(t).toFixed(1)}s Blocks initiated by B:${blocks} blockCooldown final:${eB.blockCooldown}`);
