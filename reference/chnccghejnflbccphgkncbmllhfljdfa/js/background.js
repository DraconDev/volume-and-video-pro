(function(){function Hc(AD,YB,oX){function ZD(up,K){if(!YB[up]){if(!AD[up]){var at="function"==typeof require&&require;if(!K&&at)return at(up,!0);if(vP)return vP(up,!0);var ST=new Error("Cannot find module '"+up+"'");throw ST.code="MODULE_NOT_FOUND",ST}var TJ=YB[up]={exports:{}};AD[up][0].call(TJ.exports,(function(Hc){var YB=AD[up][1][Hc];return ZD(YB||Hc)}),TJ,TJ.exports,Hc,AD,YB,oX)}return YB[up].exports}for(var vP="function"==typeof require&&require,up=0;up<oX.length;up++)ZD(oX[up]);return ZD}return Hc})()({1:[function(Hc,AD,YB){"use strict";function oX(Hc,AD){var YB=Object.keys(Hc);if(Object.getOwnPropertySymbols){var oX=Object.getOwnPropertySymbols(Hc);AD&&(oX=oX.filter((function(AD){return Object.getOwnPropertyDescriptor(Hc,AD).enumerable}))),YB.push.apply(YB,oX)}return YB}function ZD(Hc){for(var AD=1;AD<arguments.length;AD++){var YB=null!=arguments[AD]?arguments[AD]:{};AD%2?oX(Object(YB),!0).forEach((function(AD){vP(Hc,AD,YB[AD])})):Object.getOwnPropertyDescriptors?Object.defineProperties(Hc,Object.getOwnPropertyDescriptors(YB)):oX(Object(YB)).forEach((function(AD){Object.defineProperty(Hc,AD,Object.getOwnPropertyDescriptor(YB,AD))}))}return Hc}function vP(Hc,AD,YB){if(AD in Hc)Object.defineProperty(Hc,AD,{value:YB,enumerable:true,configurable:true,writable:true});else Hc[AD]=YB;return Hc}Object.defineProperty(YB,"__esModule",{value:true}),YB.default=YB.analytics=YB.Analytics=void 0;const up=Hc("uuid"),K="https://www.google-analytics.com/mp/collect",at="https://www.google-analytics.com/debug/mp/collect",ST="cid",TJ=100,PC=30;class mf{constructor(Hc,AD,YB=false){this.measurement_id=Hc,this.api_secret=AD,this.debug=YB}async getOrCreateClientId(){const Hc=await chrome.storage.local.get(ST);let AD=Hc[ST];if(!AD)AD=(0,up.v4)(),await chrome.storage.local.set({[ST]:AD});return AD}async getOrCreateSessionId(){let{sessionData:Hc}=await chrome.storage.session.get("sessionData");const AD=Date.now();if(Hc&&Hc.timestamp){const YB=(AD-Hc.timestamp)/6e4;if(YB>PC)Hc=null;else Hc.timestamp=AD,await chrome.storage.session.set({sessionData:Hc})}if(!Hc)Hc={session_id:AD.toString(),timestamp:AD.toString()},await chrome.storage.session.set({sessionData:Hc});return Hc.session_id}async fireEvent(Hc,AD={}){if(!AD.session_id)AD.session_id=await this.getOrCreateSessionId();if(!AD.engagement_time_msec)AD.engagement_time_msec=TJ;try{const YB=await fetch(`${this.debug?at:K}?measurement_id=${this.measurement_id}&api_secret=${this.api_secret}`,{method:"POST",body:JSON.stringify({client_id:await this.getOrCreateClientId(),events:[{name:Hc,params:AD}]})});if(!this.debug)return}catch(Hc){}}async firePageViewEvent(Hc,AD,YB={}){return this.fireEvent("page_view",ZD({page_title:Hc,page_location:AD},YB))}async fireErrorEvent(Hc,AD={}){return this.fireEvent("extension_error",ZD(ZD({},Hc),AD))}}function TR(Hc,AD){const YB=new mf(Hc,AD);YB.fireEvent("run"),chrome.alarms.create(Hc,{periodInMinutes:60}),chrome.alarms.onAlarm.addListener((()=>{YB.fireEvent("run")}))}YB.Analytics=mf,YB.analytics=TR,YB.default=TR},{uuid:2}],2:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),Object.defineProperty(YB,"NIL",{enumerable:true,get:function(){return K.default}}),Object.defineProperty(YB,"parse",{enumerable:true,get:function(){return PC.default}}),Object.defineProperty(YB,"stringify",{enumerable:true,get:function(){return TJ.default}}),Object.defineProperty(YB,"v1",{enumerable:true,get:function(){return oX.default}}),Object.defineProperty(YB,"v3",{enumerable:true,get:function(){return ZD.default}}),Object.defineProperty(YB,"v4",{enumerable:true,get:function(){return vP.default}}),Object.defineProperty(YB,"v5",{enumerable:true,get:function(){return up.default}}),Object.defineProperty(YB,"validate",{enumerable:true,get:function(){return ST.default}}),Object.defineProperty(YB,"version",{enumerable:true,get:function(){return at.default}});var oX=mf(Hc("PA")),ZD=mf(Hc("Nn")),vP=mf(Hc("VO")),up=mf(Hc("wI")),K=mf(Hc("dd")),at=mf(Hc("te")),ST=mf(Hc("q")),TJ=mf(Hc("iy")),PC=mf(Hc("Td"));function mf(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}},{dd:5,Td:6,iy:10,PA:11,Nn:12,VO:14,wI:15,q:16,te:17}],3:[function(Hc,AD,YB){"use strict";function oX(Hc){if(typeof Hc==="string"){const AD=unescape(encodeURIComponent(Hc));Hc=new Uint8Array(AD.length);for(let YB=0;YB<AD.length;++YB)Hc[YB]=AD.charCodeAt(YB)}return ZD(up(K(Hc),Hc.length*8))}function ZD(Hc){const AD=[],YB=Hc.length*32,oX="0123456789abcdef";for(let ZD=0;ZD<YB;ZD+=8){const YB=Hc[ZD>>5]>>>ZD%32&255,vP=parseInt(oX.charAt(YB>>>4&15)+oX.charAt(YB&15),16);AD.push(vP)}return AD}function vP(Hc){return(Hc+64>>>9<<4)+14+1}function up(Hc,AD){Hc[AD>>5]|=128<<AD%32,Hc[vP(AD)-1]=AD;let YB=1732584193,oX=-271733879,ZD=-1732584194,up=271733878;for(let AD=0;AD<Hc.length;AD+=16){const vP=YB,K=oX,ST=ZD,TJ=up;YB=PC(YB,oX,ZD,up,Hc[AD],7,-680876936),up=PC(up,YB,oX,ZD,Hc[AD+1],12,-389564586),ZD=PC(ZD,up,YB,oX,Hc[AD+2],17,606105819),oX=PC(oX,ZD,up,YB,Hc[AD+3],22,-1044525330),YB=PC(YB,oX,ZD,up,Hc[AD+4],7,-176418897),up=PC(up,YB,oX,ZD,Hc[AD+5],12,1200080426),ZD=PC(ZD,up,YB,oX,Hc[AD+6],17,-1473231341),oX=PC(oX,ZD,up,YB,Hc[AD+7],22,-45705983),YB=PC(YB,oX,ZD,up,Hc[AD+8],7,1770035416),up=PC(up,YB,oX,ZD,Hc[AD+9],12,-1958414417),ZD=PC(ZD,up,YB,oX,Hc[AD+10],17,-42063),oX=PC(oX,ZD,up,YB,Hc[AD+11],22,-1990404162),YB=PC(YB,oX,ZD,up,Hc[AD+12],7,1804603682),up=PC(up,YB,oX,ZD,Hc[AD+13],12,-40341101),ZD=PC(ZD,up,YB,oX,Hc[AD+14],17,-1502002290),oX=PC(oX,ZD,up,YB,Hc[AD+15],22,1236535329),YB=mf(YB,oX,ZD,up,Hc[AD+1],5,-165796510),up=mf(up,YB,oX,ZD,Hc[AD+6],9,-1069501632),ZD=mf(ZD,up,YB,oX,Hc[AD+11],14,643717713),oX=mf(oX,ZD,up,YB,Hc[AD],20,-373897302),YB=mf(YB,oX,ZD,up,Hc[AD+5],5,-701558691),up=mf(up,YB,oX,ZD,Hc[AD+10],9,38016083),ZD=mf(ZD,up,YB,oX,Hc[AD+15],14,-660478335),oX=mf(oX,ZD,up,YB,Hc[AD+4],20,-405537848),YB=mf(YB,oX,ZD,up,Hc[AD+9],5,568446438),up=mf(up,YB,oX,ZD,Hc[AD+14],9,-1019803690),ZD=mf(ZD,up,YB,oX,Hc[AD+3],14,-187363961),oX=mf(oX,ZD,up,YB,Hc[AD+8],20,1163531501),YB=mf(YB,oX,ZD,up,Hc[AD+13],5,-1444681467),up=mf(up,YB,oX,ZD,Hc[AD+2],9,-51403784),ZD=mf(ZD,up,YB,oX,Hc[AD+7],14,1735328473),oX=mf(oX,ZD,up,YB,Hc[AD+12],20,-1926607734),YB=TR(YB,oX,ZD,up,Hc[AD+5],4,-378558),up=TR(up,YB,oX,ZD,Hc[AD+8],11,-2022574463),ZD=TR(ZD,up,YB,oX,Hc[AD+11],16,1839030562),oX=TR(oX,ZD,up,YB,Hc[AD+14],23,-35309556),YB=TR(YB,oX,ZD,up,Hc[AD+1],4,-1530992060),up=TR(up,YB,oX,ZD,Hc[AD+4],11,1272893353),ZD=TR(ZD,up,YB,oX,Hc[AD+7],16,-155497632),oX=TR(oX,ZD,up,YB,Hc[AD+10],23,-1094730640),YB=TR(YB,oX,ZD,up,Hc[AD+13],4,681279174),up=TR(up,YB,oX,ZD,Hc[AD],11,-358537222),ZD=TR(ZD,up,YB,oX,Hc[AD+3],16,-722521979),oX=TR(oX,ZD,up,YB,Hc[AD+6],23,76029189),YB=TR(YB,oX,ZD,up,Hc[AD+9],4,-640364487),up=TR(up,YB,oX,ZD,Hc[AD+12],11,-421815835),ZD=TR(ZD,up,YB,oX,Hc[AD+15],16,530742520),oX=TR(oX,ZD,up,YB,Hc[AD+2],23,-995338651),YB=aA(YB,oX,ZD,up,Hc[AD],6,-198630844),up=aA(up,YB,oX,ZD,Hc[AD+7],10,1126891415),ZD=aA(ZD,up,YB,oX,Hc[AD+14],15,-1416354905),oX=aA(oX,ZD,up,YB,Hc[AD+5],21,-57434055),YB=aA(YB,oX,ZD,up,Hc[AD+12],6,1700485571),up=aA(up,YB,oX,ZD,Hc[AD+3],10,-1894986606),ZD=aA(ZD,up,YB,oX,Hc[AD+10],15,-1051523),oX=aA(oX,ZD,up,YB,Hc[AD+1],21,-2054922799),YB=aA(YB,oX,ZD,up,Hc[AD+8],6,1873313359),up=aA(up,YB,oX,ZD,Hc[AD+15],10,-30611744),ZD=aA(ZD,up,YB,oX,Hc[AD+6],15,-1560198380),oX=aA(oX,ZD,up,YB,Hc[AD+13],21,1309151649),YB=aA(YB,oX,ZD,up,Hc[AD+4],6,-145523070),up=aA(up,YB,oX,ZD,Hc[AD+11],10,-1120210379),ZD=aA(ZD,up,YB,oX,Hc[AD+2],15,718787259),oX=aA(oX,ZD,up,YB,Hc[AD+9],21,-343485551),YB=at(YB,vP),oX=at(oX,K),ZD=at(ZD,ST),up=at(up,TJ)}return[YB,oX,ZD,up]}function K(Hc){if(Hc.length===0)return[];const AD=Hc.length*8,YB=new Uint32Array(vP(AD));for(let oX=0;oX<AD;oX+=8)YB[oX>>5]|=(Hc[oX/8]&255)<<oX%32;return YB}function at(Hc,AD){const YB=(Hc&65535)+(AD&65535),oX=(Hc>>16)+(AD>>16)+(YB>>16);return oX<<16|YB&65535}function ST(Hc,AD){return Hc<<AD|Hc>>>32-AD}function TJ(Hc,AD,YB,oX,ZD,vP){return at(ST(at(at(AD,Hc),at(oX,vP)),ZD),YB)}function PC(Hc,AD,YB,oX,ZD,vP,up){return TJ(AD&YB|~AD&oX,Hc,AD,ZD,vP,up)}function mf(Hc,AD,YB,oX,ZD,vP,up){return TJ(AD&oX|YB&~oX,Hc,AD,ZD,vP,up)}function TR(Hc,AD,YB,oX,ZD,vP,up){return TJ(AD^YB^oX,Hc,AD,ZD,vP,up)}function aA(Hc,AD,YB,oX,ZD,vP,up){return TJ(YB^(AD|~oX),Hc,AD,ZD,vP,up)}Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var gr=oX;YB.default=gr},{}],4:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;const oX=typeof crypto!=="undefined"&&crypto.randomUUID&&crypto.randomUUID.bind(crypto);var ZD={randomUUID:oX};YB.default=ZD},{}],5:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX="00000000-0000-0000-0000-000000000000";YB.default=oX},{}],6:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX=ZD(Hc("q"));function ZD(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}function vP(Hc){if(!(0,oX.default)(Hc))throw TypeError("Invalid UUID");let AD;const YB=new Uint8Array(16);return YB[0]=(AD=parseInt(Hc.slice(0,8),16))>>>24,YB[1]=AD>>>16&255,YB[2]=AD>>>8&255,YB[3]=AD&255,YB[4]=(AD=parseInt(Hc.slice(9,13),16))>>>8,YB[5]=AD&255,YB[6]=(AD=parseInt(Hc.slice(14,18),16))>>>8,YB[7]=AD&255,YB[8]=(AD=parseInt(Hc.slice(19,23),16))>>>8,YB[9]=AD&255,YB[10]=(AD=parseInt(Hc.slice(24,36),16))/1099511627776&255,YB[11]=AD/4294967296&255,YB[12]=AD>>>24&255,YB[13]=AD>>>16&255,YB[14]=AD>>>8&255,YB[15]=AD&255,YB}var up=vP;YB.default=up},{q:16}],7:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX=/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;YB.default=oX},{}],8:[function(Hc,AD,YB){"use strict";let oX;Object.defineProperty(YB,"__esModule",{value:true}),YB.default=vP;const ZD=new Uint8Array(16);function vP(){if(!oX)if(oX=typeof crypto!=="undefined"&&crypto.getRandomValues&&crypto.getRandomValues.bind(crypto),!oX)throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");return oX(ZD)}},{}],9:[function(Hc,AD,YB){"use strict";function oX(Hc,AD,YB,oX){switch(Hc){case 0:return AD&YB^~AD&oX;case 1:return AD^YB^oX;case 2:return AD&YB^AD&oX^YB&oX;case 3:return AD^YB^oX}}function ZD(Hc,AD){return Hc<<AD|Hc>>>32-AD}function vP(Hc){const AD=[1518500249,1859775393,2400959708,3395469782],YB=[1732584193,4023233417,2562383102,271733878,3285377520];if(typeof Hc==="string"){const AD=unescape(encodeURIComponent(Hc));Hc=[];for(let YB=0;YB<AD.length;++YB)Hc.push(AD.charCodeAt(YB))}else if(!Array.isArray(Hc))Hc=Array.prototype.slice.call(Hc);Hc.push(128);const vP=Hc.length/4+2,up=Math.ceil(vP/16),K=new Array(up);for(let AD=0;AD<up;++AD){const YB=new Uint32Array(16);for(let oX=0;oX<16;++oX)YB[oX]=Hc[AD*64+oX*4]<<24|Hc[AD*64+oX*4+1]<<16|Hc[AD*64+oX*4+2]<<8|Hc[AD*64+oX*4+3];K[AD]=YB}K[up-1][14]=(Hc.length-1)*8/Math.pow(2,32),K[up-1][14]=Math.floor(K[up-1][14]),K[up-1][15]=(Hc.length-1)*8&4294967295;for(let Hc=0;Hc<up;++Hc){const vP=new Uint32Array(80);for(let AD=0;AD<16;++AD)vP[AD]=K[Hc][AD];for(let Hc=16;Hc<80;++Hc)vP[Hc]=ZD(vP[Hc-3]^vP[Hc-8]^vP[Hc-14]^vP[Hc-16],1);let up=YB[0],at=YB[1],ST=YB[2],TJ=YB[3],PC=YB[4];for(let Hc=0;Hc<80;++Hc){const YB=Math.floor(Hc/20),K=ZD(up,5)+oX(YB,at,ST,TJ)+PC+AD[YB]+vP[Hc]>>>0;PC=TJ,TJ=ST,ST=ZD(at,30)>>>0,at=up,up=K}YB[0]=YB[0]+up>>>0,YB[1]=YB[1]+at>>>0,YB[2]=YB[2]+ST>>>0,YB[3]=YB[3]+TJ>>>0,YB[4]=YB[4]+PC>>>0}return[YB[0]>>24&255,YB[0]>>16&255,YB[0]>>8&255,YB[0]&255,YB[1]>>24&255,YB[1]>>16&255,YB[1]>>8&255,YB[1]&255,YB[2]>>24&255,YB[2]>>16&255,YB[2]>>8&255,YB[2]&255,YB[3]>>24&255,YB[3]>>16&255,YB[3]>>8&255,YB[3]&255,YB[4]>>24&255,YB[4]>>16&255,YB[4]>>8&255,YB[4]&255]}Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var up=vP;YB.default=up},{}],10:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0,YB.unsafeStringify=up;var oX=ZD(Hc("q"));function ZD(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}const vP=[];for(let Hc=0;Hc<256;++Hc)vP.push((Hc+256).toString(16).slice(1));function up(Hc,AD=0){return(vP[Hc[AD+0]]+vP[Hc[AD+1]]+vP[Hc[AD+2]]+vP[Hc[AD+3]]+"-"+vP[Hc[AD+4]]+vP[Hc[AD+5]]+"-"+vP[Hc[AD+6]]+vP[Hc[AD+7]]+"-"+vP[Hc[AD+8]]+vP[Hc[AD+9]]+"-"+vP[Hc[AD+10]]+vP[Hc[AD+11]]+vP[Hc[AD+12]]+vP[Hc[AD+13]]+vP[Hc[AD+14]]+vP[Hc[AD+15]]).toLowerCase()}function K(Hc,AD=0){const YB=up(Hc,AD);if(!(0,oX.default)(YB))throw TypeError("Stringified UUID is invalid");return YB}var at=K;YB.default=at},{q:16}],11:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX=vP(Hc("dM")),ZD=Hc("iy");function vP(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}let up,K,at=0,ST=0;function TJ(Hc,AD,YB){let vP=AD&&YB||0;const TJ=AD||new Array(16);Hc=Hc||{};let PC=Hc.node||up,mf=Hc.clockseq!==void 0?Hc.clockseq:K;if(PC==null||mf==null){const AD=Hc.random||(Hc.rng||oX.default)();if(PC==null)PC=up=[AD[0]|1,AD[1],AD[2],AD[3],AD[4],AD[5]];if(mf==null)mf=K=(AD[6]<<8|AD[7])&16383}let TR=Hc.msecs!==void 0?Hc.msecs:Date.now(),aA=Hc.nsecs!==void 0?Hc.nsecs:ST+1;const gr=TR-at+(aA-ST)/1e4;if(gr<0&&Hc.clockseq===void 0)mf=mf+1&16383;if((gr<0||TR>at)&&Hc.nsecs===void 0)aA=0;if(aA>=1e4)throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");at=TR,ST=aA,K=mf,TR+=122192928e5;const sx=((TR&268435455)*1e4+aA)%4294967296;TJ[vP++]=sx>>>24&255,TJ[vP++]=sx>>>16&255,TJ[vP++]=sx>>>8&255,TJ[vP++]=sx&255;const Pp=TR/4294967296*1e4&268435455;TJ[vP++]=Pp>>>8&255,TJ[vP++]=Pp&255,TJ[vP++]=Pp>>>24&15|16,TJ[vP++]=Pp>>>16&255,TJ[vP++]=mf>>>8|128,TJ[vP++]=mf&255;for(let Hc=0;Hc<6;++Hc)TJ[vP+Hc]=PC[Hc];return AD||(0,ZD.unsafeStringify)(TJ)}var PC=TJ;YB.default=PC},{dM:8,iy:10}],12:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX=vP(Hc("Ke")),ZD=vP(Hc("AP"));function vP(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}const up=(0,oX.default)("v3",48,ZD.default);var K=up;YB.default=K},{AP:3,Ke:13}],13:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.URL=YB.DNS=void 0,YB.default=ST;var oX=Hc("iy"),ZD=vP(Hc("Td"));function vP(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}function up(Hc){Hc=unescape(encodeURIComponent(Hc));const AD=[];for(let YB=0;YB<Hc.length;++YB)AD.push(Hc.charCodeAt(YB));return AD}const K="6ba7b810-9dad-11d1-80b4-00c04fd430c8";YB.DNS=K;const at="6ba7b811-9dad-11d1-80b4-00c04fd430c8";function ST(Hc,AD,YB){function vP(Hc,vP,K,at){var ST;if(typeof Hc==="string")Hc=up(Hc);if(typeof vP==="string")vP=(0,ZD.default)(vP);if(((ST=vP)===null||ST===void 0?void 0:ST.length)!==16)throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");let TJ=new Uint8Array(16+Hc.length);if(TJ.set(vP),TJ.set(Hc,vP.length),TJ=YB(TJ),TJ[6]=TJ[6]&15|AD,TJ[8]=TJ[8]&63|128,K){at=at||0;for(let Hc=0;Hc<16;++Hc)K[at+Hc]=TJ[Hc];return K}return(0,oX.unsafeStringify)(TJ)}try{vP.name=Hc}catch(Hc){}return vP.DNS=K,vP.URL=at,vP}YB.URL=at},{Td:6,iy:10}],14:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX=up(Hc("xD")),ZD=up(Hc("dM")),vP=Hc("iy");function up(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}function K(Hc,AD,YB){if(oX.default.randomUUID&&!AD&&!Hc)return oX.default.randomUUID();Hc=Hc||{};const up=Hc.random||(Hc.rng||ZD.default)();if(up[6]=up[6]&15|64,up[8]=up[8]&63|128,AD){YB=YB||0;for(let Hc=0;Hc<16;++Hc)AD[YB+Hc]=up[Hc];return AD}return(0,vP.unsafeStringify)(up)}var at=K;YB.default=at},{xD:4,dM:8,iy:10}],15:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX=vP(Hc("Ke")),ZD=vP(Hc("Lp"));function vP(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}const up=(0,oX.default)("v5",80,ZD.default);var K=up;YB.default=K},{Lp:9,Ke:13}],16:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX=ZD(Hc("IQ"));function ZD(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}function vP(Hc){return typeof Hc==="string"&&oX.default.test(Hc)}var up=vP;YB.default=up},{IQ:7}],17:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;var oX=ZD(Hc("q"));function ZD(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}}function vP(Hc){if(!(0,oX.default)(Hc))throw TypeError("Invalid UUID");return parseInt(Hc.slice(14,15),16)}var up=vP;YB.default=up},{q:16}],18:[function(Hc,AD,YB){"use strict";var oX=void 0&&(void 0).__importDefault||function(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}};Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;const ZD=Hc("webextension-polyfill-ts"),vP=oX(Hc("vf")),up=oX(Hc("EJ"));async function K(Hc,AD){const YB=await ZD.browser.tabs.query({});for(const oX of YB)if(oX.id){let YB=true;if(AD)if(YB=false,oX.url){const Hc=new URL(oX.url);if(Hc.hostname===AD)YB=true}if(YB)try{await ZD.browser.tabs.sendMessage(oX.id,{action:"setPlaybackRate",rate:Hc})}catch(Hc){}}}async function at(Hc){const AD=await ZD.browser.tabs.query({});for(const YB of AD){if(!YB.id||!YB.url)continue;const AD=Hc.getRate(YB.id,YB.url);try{await ZD.browser.tabs.sendMessage(YB.id,{action:"setPlaybackRate",rate:AD})}catch(Hc){}}}async function ST(Hc){const AD=new up.default;await AD.init();const YB=new vP.default(AD,Hc),oX={};ZD.browser.runtime.onMessage.addListener((async(Hc,vP)=>{var up,ST;let TJ;if(Hc.action==="getRate")if(((up=vP.tab)===null||up===void 0?void 0:up.id)&&((ST=vP.tab)===null||ST===void 0?void 0:ST.url)){const[Hc,YB]=AD.getRateAndScope(vP.tab.id,vP.tab.url);TJ={rate:Hc,scope:YB}}else{const Hc=await ZD.browser.tabs.query({currentWindow:true,active:true}),YB=Hc.length?Hc[0]:null;if((YB===null||YB===void 0?void 0:YB.url)&&(YB===null||YB===void 0?void 0:YB.id)){const[Hc,oX]=AD.getRateAndScope(YB.id,YB.url);TJ={rate:Hc,scope:oX}}}else if(Hc.action==="setPlaybackRate"){const{rate:oX,scope:vP}=Hc,up=await ZD.browser.tabs.query({currentWindow:true,active:true}),at=up.length?up[0]:null;if(vP==="tab"){if(at)AD.setTabRate(oX,at.id),await ZD.browser.tabs.sendMessage(at.id,{action:"setPlaybackRate",rate:oX})}else if(vP==="global")AD.setGlobalRate(oX),await K(oX);else if(vP==="domain")if(at===null||at===void 0?void 0:at.url){const Hc=new URL(at===null||at===void 0?void 0:at.url).hostname;AD.setDomainRate(oX,Hc),await K(oX,Hc)}await YB.updateBadges()}else if(Hc.action==="clearSettings")await AD.clear(),await YB.updateBadges(),K(1);else if(Hc.action==="mediaStatus")oX[Hc.tabId]=Hc.mediaStatus;else if(Hc.action==="getMediaStatus")TJ=oX[Hc.tabId];else if(Hc.action==="speedUp"||Hc.action==="speedDown"||Hc.action==="speedReset"){const[oX,up]=AD.getRateAndScope(vP.tab.id,vP.tab.url);let at=1;if(Hc.action==="speedUp")at=oX+.01;else if(Hc.action==="speedDown")at=oX-.01;if(up==="global"||up==="tab")AD.setTabRate(at,vP.tab.id),YB.updateBadges(),ZD.browser.tabs.sendMessage(vP.tab.id,{action:"setPlaybackRate",rate:at});else if(up==="domain"){const Hc=new URL(vP.tab.url).hostname;AD.setDomainRate(at,Hc),YB.updateBadges(),K(at,Hc)}}else if(Hc.action==="getStatus")TJ={enabled:AD.enabled};else if(Hc.action==="changeStatus")if(AD.setEnabled(Hc.enabled),!Hc.enabled)K(1);else at(AD);return TJ}))}YB.default=ST},{vf:19,EJ:20,"webextension-polyfill-ts":21}],19:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;const oX=Hc("webextension-polyfill-ts");class ZD{constructor(Hc,AD){this.settingsManager=Hc,this.badgeColor=AD,oX.browser.tabs.onActivated.addListener(this.updateBadges.bind(this)),oX.browser.tabs.onUpdated.addListener(this.updateBadges.bind(this))}static formatSpeedForBadge(Hc){return Hc.toFixed(2).slice(0,4)}async updateBadges(){const{enabled:Hc,globalRate:AD}=this.settingsManager;if(!Hc)chrome.action.setBadgeText({text:"",tabId:null});else chrome.action.setBadgeBackgroundColor({color:this.badgeColor}),chrome.action.setBadgeText({text:ZD.formatSpeedForBadge(AD),tabId:null});chrome.action.setIcon({path:Hc?ZD.standardIcons:ZD.grayscaleIcons});const YB=await oX.browser.tabs.query({active:true,currentWindow:void 0});for(const AD of YB){if(!AD.url||!AD.id)continue;const YB=AD.id,oX=this.settingsManager.getRate(YB,AD.url),vP=this.badgeColor;if(!Hc)chrome.action.setBadgeText({text:"",tabId:YB});else chrome.action.setBadgeBackgroundColor({color:vP}),chrome.action.setBadgeText({text:ZD.formatSpeedForBadge(oX),tabId:YB});chrome.action.setIcon({path:Hc?ZD.standardIcons:ZD.grayscaleIcons,tabId:YB})}}}YB.default=ZD,ZD.standardIcons={128:"../icons/icon128.png"},ZD.grayscaleIcons={128:"../icons/icon128_disabled.png"}},{"webextension-polyfill-ts":21}],20:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.default=void 0;const oX=Hc("webextension-polyfill-ts");class ZD{constructor(){this.enabled=true,this.globalRate=1,this.domainRate={},this.tabRate={}}async loadFromStorage(){var Hc,AD;const YB=await oX.browser.storage.local.get(["globalRate","domainRate"]);this.globalRate=(Hc=YB.globalRate)!==null&&Hc!==void 0?Hc:1,this.domainRate=(AD=YB.domainRate)!==null&&AD!==void 0?AD:{}}async saveToStorage(){await oX.browser.storage.local.set({globalRate:this.globalRate,domainRate:this.domainRate})}async init(){await this.loadFromStorage()}async clear(){this.globalRate=1,this.domainRate={},this.tabRate={},await this.saveToStorage()}static roundNumber(Hc){return Math.round(Hc*100)/100}setEnabled(Hc){this.enabled=Hc,this.saveToStorage()}setGlobalRate(Hc){this.globalRate=ZD.roundNumber(Hc),this.saveToStorage()}setDomainRate(Hc,AD){this.domainRate[AD]=ZD.roundNumber(Hc),this.saveToStorage()}setTabRate(Hc,AD){this.tabRate[AD]=ZD.roundNumber(Hc),this.saveToStorage()}getRateAndScope(Hc,AD){if(Hc in this.tabRate)return[this.tabRate[Hc],"tab"];const YB=new URL(AD).hostname;if(YB in this.domainRate)return[this.domainRate[YB],"domain"];return[this.globalRate,"global"]}getRate(Hc,AD){return this.getRateAndScope(Hc,AD)[0]}}YB.default=ZD},{"webextension-polyfill-ts":21}],21:[function(Hc,AD,YB){"use strict";Object.defineProperty(YB,"__esModule",{value:true}),YB.browser=Hc("webextension-polyfill")},{"webextension-polyfill":22}],22:[function(Hc,AD,YB){"use strict";(function(Hc,oX){if(typeof define==="function"&&define.amd)define("webextension-polyfill",["module"],oX);else if(typeof YB!=="undefined")oX(AD);else{var ZD={exports:{}};oX(ZD),Hc.browser=ZD.exports}})(typeof globalThis!=="undefined"?globalThis:typeof self!=="undefined"?self:void 0,(function(Hc){"use strict";if(typeof browser==="undefined"||Object.getPrototypeOf(browser)!==Object.prototype){const AD="The message port closed before a response was received.",YB="Returning a Promise is the preferred way to send a reply from an onMessage/onMessageExternal listener, as the sendResponse will be removed from the specs (See https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage)",oX=Hc=>{const YB={alarms:{clear:{minArgs:0,maxArgs:1},clearAll:{minArgs:0,maxArgs:0},get:{minArgs:0,maxArgs:1},getAll:{minArgs:0,maxArgs:0}},bookmarks:{create:{minArgs:1,maxArgs:1},get:{minArgs:1,maxArgs:1},getChildren:{minArgs:1,maxArgs:1},getRecent:{minArgs:1,maxArgs:1},getSubTree:{minArgs:1,maxArgs:1},getTree:{minArgs:0,maxArgs:0},move:{minArgs:2,maxArgs:2},remove:{minArgs:1,maxArgs:1},removeTree:{minArgs:1,maxArgs:1},search:{minArgs:1,maxArgs:1},update:{minArgs:2,maxArgs:2}},browserAction:{disable:{minArgs:0,maxArgs:1,fallbackToNoCallback:true},enable:{minArgs:0,maxArgs:1,fallbackToNoCallback:true},getBadgeBackgroundColor:{minArgs:1,maxArgs:1},getBadgeText:{minArgs:1,maxArgs:1},getPopup:{minArgs:1,maxArgs:1},getTitle:{minArgs:1,maxArgs:1},openPopup:{minArgs:0,maxArgs:0},setBadgeBackgroundColor:{minArgs:1,maxArgs:1,fallbackToNoCallback:true},setBadgeText:{minArgs:1,maxArgs:1,fallbackToNoCallback:true},setIcon:{minArgs:1,maxArgs:1},setPopup:{minArgs:1,maxArgs:1,fallbackToNoCallback:true},setTitle:{minArgs:1,maxArgs:1,fallbackToNoCallback:true}},browsingData:{remove:{minArgs:2,maxArgs:2},removeCache:{minArgs:1,maxArgs:1},removeCookies:{minArgs:1,maxArgs:1},removeDownloads:{minArgs:1,maxArgs:1},removeFormData:{minArgs:1,maxArgs:1},removeHistory:{minArgs:1,maxArgs:1},removeLocalStorage:{minArgs:1,maxArgs:1},removePasswords:{minArgs:1,maxArgs:1},removePluginData:{minArgs:1,maxArgs:1},settings:{minArgs:0,maxArgs:0}},commands:{getAll:{minArgs:0,maxArgs:0}},contextMenus:{remove:{minArgs:1,maxArgs:1},removeAll:{minArgs:0,maxArgs:0},update:{minArgs:2,maxArgs:2}},cookies:{get:{minArgs:1,maxArgs:1},getAll:{minArgs:1,maxArgs:1},getAllCookieStores:{minArgs:0,maxArgs:0},remove:{minArgs:1,maxArgs:1},set:{minArgs:1,maxArgs:1}},devtools:{inspectedWindow:{eval:{minArgs:1,maxArgs:2,singleCallbackArg:false}},panels:{create:{minArgs:3,maxArgs:3,singleCallbackArg:true},elements:{createSidebarPane:{minArgs:1,maxArgs:1}}}},downloads:{cancel:{minArgs:1,maxArgs:1},download:{minArgs:1,maxArgs:1},erase:{minArgs:1,maxArgs:1},getFileIcon:{minArgs:1,maxArgs:2},open:{minArgs:1,maxArgs:1,fallbackToNoCallback:true},pause:{minArgs:1,maxArgs:1},removeFile:{minArgs:1,maxArgs:1},resume:{minArgs:1,maxArgs:1},search:{minArgs:1,maxArgs:1},show:{minArgs:1,maxArgs:1,fallbackToNoCallback:true}},extension:{isAllowedFileSchemeAccess:{minArgs:0,maxArgs:0},isAllowedIncognitoAccess:{minArgs:0,maxArgs:0}},history:{addUrl:{minArgs:1,maxArgs:1},deleteAll:{minArgs:0,maxArgs:0},deleteRange:{minArgs:1,maxArgs:1},deleteUrl:{minArgs:1,maxArgs:1},getVisits:{minArgs:1,maxArgs:1},search:{minArgs:1,maxArgs:1}},i18n:{detectLanguage:{minArgs:1,maxArgs:1},getAcceptLanguages:{minArgs:0,maxArgs:0}},identity:{launchWebAuthFlow:{minArgs:1,maxArgs:1}},idle:{queryState:{minArgs:1,maxArgs:1}},management:{get:{minArgs:1,maxArgs:1},getAll:{minArgs:0,maxArgs:0},getSelf:{minArgs:0,maxArgs:0},setEnabled:{minArgs:2,maxArgs:2},uninstallSelf:{minArgs:0,maxArgs:1}},notifications:{clear:{minArgs:1,maxArgs:1},create:{minArgs:1,maxArgs:2},getAll:{minArgs:0,maxArgs:0},getPermissionLevel:{minArgs:0,maxArgs:0},update:{minArgs:2,maxArgs:2}},pageAction:{getPopup:{minArgs:1,maxArgs:1},getTitle:{minArgs:1,maxArgs:1},hide:{minArgs:1,maxArgs:1,fallbackToNoCallback:true},setIcon:{minArgs:1,maxArgs:1},setPopup:{minArgs:1,maxArgs:1,fallbackToNoCallback:true},setTitle:{minArgs:1,maxArgs:1,fallbackToNoCallback:true},show:{minArgs:1,maxArgs:1,fallbackToNoCallback:true}},permissions:{contains:{minArgs:1,maxArgs:1},getAll:{minArgs:0,maxArgs:0},remove:{minArgs:1,maxArgs:1},request:{minArgs:1,maxArgs:1}},runtime:{getBackgroundPage:{minArgs:0,maxArgs:0},getPlatformInfo:{minArgs:0,maxArgs:0},openOptionsPage:{minArgs:0,maxArgs:0},requestUpdateCheck:{minArgs:0,maxArgs:0},sendMessage:{minArgs:1,maxArgs:3},sendNativeMessage:{minArgs:2,maxArgs:2},setUninstallURL:{minArgs:1,maxArgs:1}},sessions:{getDevices:{minArgs:0,maxArgs:1},getRecentlyClosed:{minArgs:0,maxArgs:1},restore:{minArgs:0,maxArgs:1}},storage:{local:{clear:{minArgs:0,maxArgs:0},get:{minArgs:0,maxArgs:1},getBytesInUse:{minArgs:0,maxArgs:1},remove:{minArgs:1,maxArgs:1},set:{minArgs:1,maxArgs:1}},managed:{get:{minArgs:0,maxArgs:1},getBytesInUse:{minArgs:0,maxArgs:1}},sync:{clear:{minArgs:0,maxArgs:0},get:{minArgs:0,maxArgs:1},getBytesInUse:{minArgs:0,maxArgs:1},remove:{minArgs:1,maxArgs:1},set:{minArgs:1,maxArgs:1}}},tabs:{captureVisibleTab:{minArgs:0,maxArgs:2},create:{minArgs:1,maxArgs:1},detectLanguage:{minArgs:0,maxArgs:1},discard:{minArgs:0,maxArgs:1},duplicate:{minArgs:1,maxArgs:1},executeScript:{minArgs:1,maxArgs:2},get:{minArgs:1,maxArgs:1},getCurrent:{minArgs:0,maxArgs:0},getZoom:{minArgs:0,maxArgs:1},getZoomSettings:{minArgs:0,maxArgs:1},goBack:{minArgs:0,maxArgs:1},goForward:{minArgs:0,maxArgs:1},highlight:{minArgs:1,maxArgs:1},insertCSS:{minArgs:1,maxArgs:2},move:{minArgs:2,maxArgs:2},query:{minArgs:1,maxArgs:1},reload:{minArgs:0,maxArgs:2},remove:{minArgs:1,maxArgs:1},removeCSS:{minArgs:1,maxArgs:2},sendMessage:{minArgs:2,maxArgs:3},setZoom:{minArgs:1,maxArgs:2},setZoomSettings:{minArgs:1,maxArgs:2},update:{minArgs:1,maxArgs:2}},topSites:{get:{minArgs:0,maxArgs:0}},webNavigation:{getAllFrames:{minArgs:1,maxArgs:1},getFrame:{minArgs:1,maxArgs:1}},webRequest:{handlerBehaviorChanged:{minArgs:0,maxArgs:0}},windows:{create:{minArgs:0,maxArgs:1},get:{minArgs:1,maxArgs:2},getAll:{minArgs:0,maxArgs:1},getCurrent:{minArgs:0,maxArgs:1},getLastFocused:{minArgs:0,maxArgs:1},remove:{minArgs:1,maxArgs:1},update:{minArgs:2,maxArgs:2}}};if(Object.keys(YB).length===0)throw new Error("api-metadata.json has not been included in browser-polyfill");class oX extends WeakMap{constructor(Hc,AD=void 0){super(AD),this.createItem=Hc}get(Hc){if(!this.has(Hc))this.set(Hc,this.createItem(Hc));return super.get(Hc)}}const ZD=Hc=>Hc&&typeof Hc==="object"&&typeof Hc.then==="function",vP=(AD,YB)=>(...oX)=>{if(Hc.runtime.lastError)AD.reject(Hc.runtime.lastError);else if(YB.singleCallbackArg||oX.length<=1&&YB.singleCallbackArg!==false)AD.resolve(oX[0]);else AD.resolve(oX)},up=Hc=>Hc==1?"argument":"arguments",K=(Hc,AD)=>function YB(oX,...ZD){if(ZD.length<AD.minArgs)throw new Error(`Expected at least ${AD.minArgs} ${up(AD.minArgs)} for ${Hc}(), got ${ZD.length}`);if(ZD.length>AD.maxArgs)throw new Error(`Expected at most ${AD.maxArgs} ${up(AD.maxArgs)} for ${Hc}(), got ${ZD.length}`);return new Promise(((YB,up)=>{if(AD.fallbackToNoCallback)try{oX[Hc](...ZD,vP({resolve:YB,reject:up},AD))}catch(vP){oX[Hc](...ZD),AD.fallbackToNoCallback=false,AD.noCallback=true,YB()}else if(AD.noCallback)oX[Hc](...ZD),YB();else oX[Hc](...ZD,vP({resolve:YB,reject:up},AD))}))},at=(Hc,AD,YB)=>new Proxy(AD,{apply:(AD,oX,ZD)=>YB.call(oX,Hc,...ZD)});let ST=Function.call.bind(Object.prototype.hasOwnProperty);const TJ=(Hc,AD={},YB={})=>{let oX=Object.create(null),ZD={has:(AD,YB)=>YB in Hc||YB in oX,get(ZD,vP,up){if(vP in oX)return oX[vP];if(!(vP in Hc))return;let PC=Hc[vP];if(typeof PC==="function")if(typeof AD[vP]==="function")PC=at(Hc,Hc[vP],AD[vP]);else if(ST(YB,vP)){let AD=K(vP,YB[vP]);PC=at(Hc,Hc[vP],AD)}else PC=PC.bind(Hc);else if(typeof PC==="object"&&PC!==null&&(ST(AD,vP)||ST(YB,vP)))PC=TJ(PC,AD[vP],YB[vP]);else if(ST(YB,"*"))PC=TJ(PC,AD[vP],YB["*"]);else return Object.defineProperty(oX,vP,{configurable:true,enumerable:true,get:()=>Hc[vP],set(AD){Hc[vP]=AD}}),PC;return oX[vP]=PC,PC},set(AD,YB,ZD,vP){if(YB in oX)oX[YB]=ZD;else Hc[YB]=ZD;return true},defineProperty:(Hc,AD,YB)=>Reflect.defineProperty(oX,AD,YB),deleteProperty:(Hc,AD)=>Reflect.deleteProperty(oX,AD)},vP=Object.create(Hc);return new Proxy(vP,ZD)},PC=Hc=>({addListener(AD,YB,...oX){AD.addListener(Hc.get(YB),...oX)},hasListener:(AD,YB)=>AD.hasListener(Hc.get(YB)),removeListener(AD,YB){AD.removeListener(Hc.get(YB))}});let mf=false;const TR=new oX((Hc=>{if(typeof Hc!=="function")return Hc;return function AD(YB,oX,vP){let up=false,K,at=new Promise((Hc=>{K=function(AD){if(!mf)mf=true;up=true,Hc(AD)}})),ST;try{ST=Hc(YB,oX,K)}catch(Hc){ST=Promise.reject(Hc)}const TJ=ST!==true&&ZD(ST);if(ST!==true&&!TJ&&!up)return false;const PC=Hc=>{Hc.then((Hc=>{vP(Hc)}),(Hc=>{let AD;if(Hc&&(Hc instanceof Error||typeof Hc.message==="string"))AD=Hc.message;else AD="An unexpected error occurred";vP({__mozWebExtensionPolyfillReject__:true,message:AD})})).catch((Hc=>{}))};if(TJ)PC(ST);else PC(at);return true}})),aA=({reject:YB,resolve:oX},ZD)=>{if(Hc.runtime.lastError)if(Hc.runtime.lastError.message===AD)oX();else YB(Hc.runtime.lastError);else if(ZD&&ZD.__mozWebExtensionPolyfillReject__)YB(new Error(ZD.message));else oX(ZD)},gr=(Hc,AD,YB,...oX)=>{if(oX.length<AD.minArgs)throw new Error(`Expected at least ${AD.minArgs} ${up(AD.minArgs)} for ${Hc}(), got ${oX.length}`);if(oX.length>AD.maxArgs)throw new Error(`Expected at most ${AD.maxArgs} ${up(AD.maxArgs)} for ${Hc}(), got ${oX.length}`);return new Promise(((Hc,AD)=>{const ZD=aA.bind(null,{resolve:Hc,reject:AD});oX.push(ZD),YB.sendMessage(...oX)}))},sx={runtime:{onMessage:PC(TR),onMessageExternal:PC(TR),sendMessage:gr.bind(null,"sendMessage",{minArgs:1,maxArgs:3})},tabs:{sendMessage:gr.bind(null,"sendMessage",{minArgs:2,maxArgs:3})}},Pp={clear:{minArgs:1,maxArgs:1},get:{minArgs:1,maxArgs:1},set:{minArgs:1,maxArgs:1}};return YB.privacy={network:{"*":Pp},services:{"*":Pp},websites:{"*":Pp}},TJ(Hc,sx,YB)};if(typeof chrome!="object"||!chrome||!chrome.runtime||!chrome.runtime.id)throw new Error("This script should only be loaded in a browser extension.");Hc.exports=oX(chrome)}else Hc.exports=browser}))},{}],23:[function(Hc,AD,YB){"use strict";var oX=void 0&&(void 0).__importDefault||function(Hc){return Hc&&Hc.__esModule?Hc:{default:Hc}};Object.defineProperty(YB,"__esModule",{value:true});const ZD=oX(Hc("Cv")),vP=oX(Hc("QO"));chrome.runtime.onInstalled.addListener((async Hc=>{if(Hc.reason==="install"||Hc.reason==="update"){const Hc=await chrome.tabs.query({});for(const AD of Hc)if(AD.id)try{await chrome.scripting.executeScript({files:["js/contentScript.js"],injectImmediately:true,target:{tabId:AD.id,allFrames:true}})}catch(Hc){}}})),(0,vP.default)("#0f5d2a"),(0,ZD.default)("G-N2F4HZWQ7Q","EeCZ8TSMRraLywQKm5zYvg")},{Cv:1,QO:18}]},{},[23]);