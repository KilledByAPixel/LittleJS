/** 
 * LittleJS Medal System
 * <br> - Tracks and displays medals
 * <br> - Saves medals to local storage
 * <br> - Newgrounds and OS13k integration
 * @namespace Medals
 */

'use strict';

/** List of all medals
 *  @memberof Medals */
const medals = [];

/** Set to stop medals from being unlockable (like if cheats are enabled)
 *  @memberof Medals */
let medalsPreventUnlock;

/** This can used to enable Newgrounds functionality
 *  @type {Newgrounds}
 *  @memberof Medals */
let newgrounds;

// Engine internal variables not exposed to documentation
let medalsDisplayQueue = [], medalsSaveName, medalsDisplayTimeLast;

///////////////////////////////////////////////////////////////////////////////

/** Initialize medals with a save name used for storage
 *  <br> - Call this after creating all medals
 *  <br> - Checks if medals are unlocked
 *  @param {String} saveName
 *  @memberof Medals */
function medalsInit(saveName)
{
    // check if medals are unlocked
    medalsSaveName = saveName;
    debugMedals || medals.forEach(medal=> localStorage[medal.storageKey()]);
}

/** 
 * Medal Object - Tracks an unlockable medal 
 * @example
 * // create a medal
 * const medal_example = new Medal(0, 'Example Medal', 'More info about the medal goes here.', '🎖️');
 * 
 * // initialize medals
 * medalsInit('Example Game');
 * 
 * // unlock the medal
 * medal_example.unlock();
 */
class Medal
{
    /** Create an medal object and adds it to the list of medals
     *  @param {Number} id            - The unique identifier of the medal
     *  @param {String} name          - Name of the medal
     *  @param {String} [description] - Description of the medal
     *  @param {String} [icon='🏆']  - Icon for the medal
     *  @param {String} [src]         - Image location for the medal
     */
    constructor(id, name, description='', icon='🏆', src)
    {
        ASSERT(id >= 0 && !medals[id]);

        // save attributes and add to list of medals
        medals[this.id = id] = this;
        this.name = name;
        this.description = description;
        this.icon = icon;
        this.image = new Image();
        if (src)
            this.image.src = src;
    }

    /** Unlocks a medal if not already unlocked */
    unlock()
    {
        if (medalsPreventUnlock || this.unlocked)
            return;

        // save the medal
        ASSERT(medalsSaveName); // save name must be set
        localStorage[this.storageKey()] = this.unlocked = 1;
        medalsDisplayQueue.push(this);

        // save for newgrounds and OS13K
        newgrounds && newgrounds.unlockMedal(this.id);
        localStorage['OS13kTrophy,' + this.icon + ',' + medalsSaveName + ',' + this.name] = this.description;
    }

    /** Render a medal
     *  @param {Number} [hidePercent=0] - How much to slide the medal off screen
     */
    render(hidePercent=0)
    {
        const context = overlayContext;
        const width = min(medalDisplayWidth, mainCanvas.width);
        const x = overlayCanvas.width - width;
        const y = -medalDisplayHeight*hidePercent;

        // draw containing rect and clip to that region
        context.save();
        context.beginPath();
        context.fillStyle = '#ddd'
        context.fill(context.rect(x, y, width, medalDisplayHeight));
        context.strokeStyle = '#000';
        context.lineWidth = 3;
        context.stroke();
        context.clip();

        // draw the icon and text
        this.renderIcon(x+15+medalDisplayIconSize/2, y+medalDisplayHeight/2);
        context.textAlign = 'left';
        context.font = '38px '+ fontDefault;
        context.fillText(this.name, x+medalDisplayIconSize+30, y+28);
        context.font = '24px '+ fontDefault;
        context.fillText(this.description, x+medalDisplayIconSize+30, y+60);
        context.restore();
    }

    /** Render the icon for a medal
     *  @param {Number} x - Screen space X position
     *  @param {Number} y - Screen space Y position
     *  @param {Number} [size=medalDisplayIconSize] - Screen space size
     */
    renderIcon(x, y, size=medalDisplayIconSize)
    {
        // draw the image or icon
        const context = overlayContext;
        context.fillStyle = '#000';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = size*.7 + 'px '+ fontDefault;
        if (this.image.src)
            context.drawImage(this.image, x-size/2, y-size/2, size, size);
        else
            context.fillText(this.icon, x, y); // show icon if there is no image
    }
 
    // Get local storage key used by the medal
    storageKey() { return medalsSaveName + '_' + this.id; }
}

// engine automatically renders medals
function medalsRender()
{
    if (!medalsDisplayQueue.length)
        return;
    
    // update first medal in queue
    const medal = medalsDisplayQueue[0];
    const time = timeReal - medalsDisplayTimeLast;
    if (!medalsDisplayTimeLast)
        medalsDisplayTimeLast = timeReal;
    else if (time > medalDisplayTime)
        medalsDisplayQueue.shift(medalsDisplayTimeLast = 0);
    else
    {
        // slide on/off medals
        const slideOffTime = medalDisplayTime - medalDisplaySlideTime;
        const hidePercent = 
            time < medalDisplaySlideTime ? 1 - time / medalDisplaySlideTime :
            time > slideOffTime ? (time - slideOffTime) / medalDisplaySlideTime : 0;
        medal.render(hidePercent);
    }
}

///////////////////////////////////////////////////////////////////////////////

/** 
 * Newgrounds API wrapper object
 * @example
 * // create a newgrounds object, replace the app id and cipher with your own
 * const app_id = '53123:1ZuSTQ9l';
 * const cipher = 'enF0vGH@Mj/FRASKL23Q==';
 * newgrounds = new Newgrounds(app_id, cipher);
 */
class Newgrounds
{
    /** Create a newgrounds object
     *  @param {Number} app_id   - The newgrounds App ID
     *  @param {String} [cipher] - The encryption Key (AES-128/Base64) */
    constructor(app_id, cipher)
    {
        ASSERT(!newgrounds && app_id);
        this.app_id = app_id;
        this.cipher = cipher;
        this.host = location ? location.hostname : '';

        // create an instance of CryptoJS for encrypted calls
        cipher && (this.cryptoJS = CryptoJS());

        // get session id from url search params
        const url = new URL(location.href);
        this.session_id = url.searchParams.get('ngio_session_id') || 0;

        if (this.session_id == 0)
            return; // only use newgrounds when logged in

        // get medals
        const medalsResult = this.call('Medal.getList');
        this.medals = medalsResult ? medalsResult.result.data['medals'] : [];
        debugMedals && console.log(this.medals);
        for (const newgroundsMedal of this.medals)
        {
            const medal = medals[newgroundsMedal['id']];
            if (medal)
            {
                // copy newgrounds medal data
                medal.image.src =   newgroundsMedal['icon'];
                medal.name =        newgroundsMedal['name'];
                medal.description = newgroundsMedal['description'];
                medal.unlocked =    newgroundsMedal['unlocked'];
                medal.difficulty =  newgroundsMedal['difficulty'];
                medal.value =       newgroundsMedal['value'];

                if (medal.value)
                    medal.description = medal.description + ' (' + medal.value + ')';
            }
        }
    
        // get scoreboards
        const scoreboardResult = this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult ? scoreboardResult.result.data.scoreboards : [];
        debugMedals && console.log(this.scoreboards);

        const keepAliveMS = 5 * 60 * 1e3;
        setInterval(()=>this.call('Gateway.ping', 0, 1), keepAliveMS);
    }

    /** Send message to unlock a medal by id
     * @param {Number} id - The medal id */
    unlockMedal(id) { return this.call('Medal.unlock', {'id':id}, 1); }

    /** Send message to post score
     * @param {Number} id    - The scoreboard id
     * @param {Number} value - The score value */
    postScore(id, value) { return this.call('ScoreBoard.postScore', {'id':id, 'value':value}, 1); }

    /** Get scores from a scoreboard
     * @param {Number} id         - The scoreboard id
     * @param {String} [user=0]   - A user's id or name
     * @param {Number} [social=0] - If true, only social scores will be loaded
     * @param {Number} [skip=0]   - Number of scores to skip before start
     * @param {Number} [limit=10] - Number of scores to include in the list
     * @return {Object}           - The response JSON object
     */
    getScores(id, user=0, social=0, skip=0, limit=10)
    { return this.call('ScoreBoard.getScores', {'id':id, 'user':user, 'social':social, 'skip':skip, 'limit':limit}); }

    /** Send message to log a view */
    logView() { return this.call('App.logView', {'host':this.host}, 1); }

    /** Send a message to call a component of the Newgrounds API
     * @param {String}  component      - Name of the component
     * @param {Object}  [parameters=0] - Parameters to use for call
     * @param {Boolean} [async=0]      - If true, don't wait for response before continuing (avoid stall)
     * @return {Object}                - The response JSON object
     */
    call(component, parameters=0, async=0)
    {
        const call = {'component':component, 'parameters':parameters};
        if (this.cipher)
        {
            // encrypt using AES-128 Base64 with cryptoJS
            const cryptoJS = this.cryptoJS;
            const aesKey = cryptoJS['enc']['Base64']['parse'](this.cipher);
            const iv = cryptoJS['lib']['WordArray']['random'](16);
            const encrypted = cryptoJS['AES']['encrypt'](JSON.stringify(call), aesKey, {'iv':iv});
            call['secure'] = cryptoJS['enc']['Base64']['stringify'](iv.concat(encrypted['ciphertext']));
            call['parameters'] = 0;
        }

        // build the input object
        const input = 
        {
            'app_id':     this.app_id,
            'session_id': this.session_id,
            'call':       call
        };

        // build post data
        const formData = new FormData();
        formData.append('input', JSON.stringify(input));
        
        // send post data
        const xmlHttp = new XMLHttpRequest();
        const url = 'https://newgrounds.io/gateway_v3.php';
        xmlHttp.open('POST', url, !debugMedals && async);
        xmlHttp.send(formData);
        debugMedals && console.log(xmlHttp.responseText);
        return xmlHttp.responseText && JSON.parse(xmlHttp.responseText);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Crypto-JS - https://github.com/brix/crypto-js [The MIT License (MIT)]
// Copyright (c) 2009-2013 Jeff Mott  Copyright (c) 2013-2016 Evan Vosberg

const CryptoJS=()=>eval(Function("[M='GBMGXz^oVYPPKKbB`agTXU|LxPc_ZBcMrZvCr~wyGfWrwk@ATqlqeTp^N?p{we}jIpEnB_sEr`l?YDkDhWhprc|Er|XETG?pTl`e}dIc[_N~}fzRycIfpW{HTolvoPB_FMe_eH~BTMx]yyOhv?biWPCGc]kABencBhgERHGf{OL`Dj`c^sh@canhy[secghiyotcdOWgO{tJIE^JtdGQRNSCrwKYciZOa]Y@tcRATYKzv|sXpboHcbCBf`}SKeXPFM|RiJsSNaIb]QPc[D]Jy_O^XkOVTZep`ONmntLL`Qz~UupHBX_Ia~WX]yTRJIxG`ioZ{fefLJFhdyYoyLPvqgH?b`[TMnTwwfzDXhfM?rKs^aFr|nyBdPmVHTtAjXoYUloEziWDCw_suyYT~lSMksI~ZNCS[Bex~j]Vz?kx`gdYSEMCsHpjbyxQvw|XxX_^nQYue{sBzVWQKYndtYQMWRef{bOHSfQhiNdtR{o?cUAHQAABThwHPT}F{VvFmgN`E@FiFYS`UJmpQNM`X|tPKHlccT}z}k{sACHL?Rt@MkWplxO`ASgh?hBsuuP|xD~LSH~KBlRs]t|l|_tQAroDRqWS^SEr[sYdPB}TAROtW{mIkE|dWOuLgLmJrucGLpebrAFKWjikTUzS|j}M}szasKOmrjy[?hpwnEfX[jGpLt@^v_eNwSQHNwtOtDgWD{rk|UgASs@mziIXrsHN_|hZuxXlPJOsA^^?QY^yGoCBx{ekLuZzRqQZdsNSx@ezDAn{XNj@fRXIwrDX?{ZQHwTEfu@GhxDOykqts|n{jOeZ@c`dvTY?e^]ATvWpb?SVyg]GC?SlzteilZJAL]mlhLjYZazY__qcVFYvt@|bIQnSno@OXyt]OulzkWqH`rYFWrwGs`v|~XeTsIssLrbmHZCYHiJrX}eEzSssH}]l]IhPQhPoQ}rCXLyhFIT[clhzYOvyHqigxmjz`phKUU^TPf[GRAIhNqSOdayFP@FmKmuIzMOeoqdpxyCOwCthcLq?n`L`tLIBboNn~uXeFcPE{C~mC`h]jUUUQe^`UqvzCutYCgct|SBrAeiYQW?X~KzCz}guXbsUw?pLsg@hDArw?KeJD[BN?GD@wgFWCiHq@Ypp_QKFixEKWqRp]oJFuVIEvjDcTFu~Zz]a{IcXhWuIdMQjJ]lwmGQ|]g~c]Hl]pl`Pd^?loIcsoNir_kikBYyg?NarXZEGYspt_vLBIoj}LI[uBFvm}tbqvC|xyR~a{kob|HlctZslTGtPDhBKsNsoZPuH`U`Fqg{gKnGSHVLJ^O`zmNgMn~{rsQuoymw^JY?iUBvw_~mMr|GrPHTERS[MiNpY[Mm{ggHpzRaJaoFomtdaQ_?xuTRm}@KjU~RtPsAdxa|uHmy}n^i||FVL[eQAPrWfLm^ndczgF~Nk~aplQvTUpHvnTya]kOenZlLAQIm{lPl@CCTchvCF[fI{^zPkeYZTiamoEcKmBMfZhk_j_~Fjp|wPVZlkh_nHu]@tP|hS@^G^PdsQ~f[RqgTDqezxNFcaO}HZhb|MMiNSYSAnQWCDJukT~e|OTgc}sf[cnr?fyzTa|EwEtRG|I~|IO}O]S|rp]CQ}}DWhSjC_|z|oY|FYl@WkCOoPuWuqr{fJu?Brs^_EBI[@_OCKs}?]O`jnDiXBvaIWhhMAQDNb{U`bqVR}oqVAvR@AZHEBY@depD]OLh`kf^UsHhzKT}CS}HQKy}Q~AeMydXPQztWSSzDnghULQgMAmbWIZ|lWWeEXrE^EeNoZApooEmrXe{NAnoDf`m}UNlRdqQ@jOc~HLOMWs]IDqJHYoMziEedGBPOxOb?[X`KxkFRg@`mgFYnP{hSaxwZfBQqTm}_?RSEaQga]w[vxc]hMne}VfSlqUeMo_iqmd`ilnJXnhdj^EEFifvZyxYFRf^VaqBhLyrGlk~qowqzHOBlOwtx?i{m~`n^G?Yxzxux}b{LSlx]dS~thO^lYE}bzKmUEzwW^{rPGhbEov[Plv??xtyKJshbG`KuO?hjBdS@Ru}iGpvFXJRrvOlrKN?`I_n_tplk}kgwSXuKylXbRQ]]?a|{xiT[li?k]CJpwy^o@ebyGQrPfF`aszGKp]baIx~H?ElETtFh]dz[OjGl@C?]VDhr}OE@V]wLTc[WErXacM{We`F|utKKjgllAxvsVYBZ@HcuMgLboFHVZmi}eIXAIFhS@A@FGRbjeoJWZ_NKd^oEH`qgy`q[Tq{x?LRP|GfBFFJV|fgZs`MLbpPYUdIV^]mD@FG]pYAT^A^RNCcXVrPsgk{jTrAIQPs_`mD}rOqAZA[}RETFz]WkXFTz_m{N@{W@_fPKZLT`@aIqf|L^Mb|crNqZ{BVsijzpGPEKQQZGlApDn`ruH}cvF|iXcNqK}cxe_U~HRnKV}sCYb`D~oGvwG[Ca|UaybXea~DdD~LiIbGRxJ_VGheI{ika}KC[OZJLn^IBkPrQj_EuoFwZ}DpoBRcK]Q}?EmTv~i_Tul{bky?Iit~tgS|o}JL_VYcCQdjeJ_MfaA`FgCgc[Ii|CBHwq~nbJeYTK{e`CNstKfTKPzw{jdhp|qsZyP_FcugxCFNpKitlR~vUrx^NrSVsSTaEgnxZTmKc`R|lGJeX}ccKLsQZQhsFkeFd|ckHIVTlGMg`~uPwuHRJS_CPuN_ogXe{Ba}dO_UBhuNXby|h?JlgBIqMKx^_u{molgL[W_iavNQuOq?ap]PGB`clAicnl@k~pA?MWHEZ{HuTLsCpOxxrKlBh]FyMjLdFl|nMIvTHyGAlPogqfZ?PlvlFJvYnDQd}R@uAhtJmDfe|iJqdkYr}r@mEjjIetDl_I`TELfoR|qTBu@Tic[BaXjP?dCS~MUK[HPRI}OUOwAaf|_}HZzrwXvbnNgltjTwkBE~MztTQhtRSWoQHajMoVyBBA`kdgK~h`o[J`dm~pm]tk@i`[F~F]DBlJKklrkR]SNw@{aG~Vhl`KINsQkOy?WhcqUMTGDOM_]bUjVd|Yh_KUCCgIJ|LDIGZCPls{RzbVWVLEhHvWBzKq|^N?DyJB|__aCUjoEgsARki}j@DQXS`RNU|DJ^a~d{sh_Iu{ONcUtSrGWW@cvUjefHHi}eSSGrNtO?cTPBShLqzwMVjWQQCCFB^culBjZHEK_{dO~Q`YhJYFn]jq~XSnG@[lQr]eKrjXpG~L^h~tDgEma^AUFThlaR{xyuP@[^VFwXSeUbVetufa@dX]CLyAnDV@Bs[DnpeghJw^?UIana}r_CKGDySoRudklbgio}kIDpA@McDoPK?iYcG?_zOmnWfJp}a[JLR[stXMo?_^Ng[whQlrDbrawZeSZ~SJstIObdDSfAA{MV}?gNunLOnbMv_~KFQUAjIMj^GkoGxuYtYbGDImEYiwEMyTpMxN_LSnSMdl{bg@dtAnAMvhDTBR_FxoQgANniRqxd`pWv@rFJ|mWNWmh[GMJz_Nq`BIN@KsjMPASXORcdHjf~rJfgZYe_uulzqM_KdPlMsuvU^YJuLtofPhGonVOQxCMuXliNvJIaoC?hSxcxKVVxWlNs^ENDvCtSmO~WxI[itnjs^RDvI@KqG}YekaSbTaB]ki]XM@[ZnDAP~@|BzLRgOzmjmPkRE@_sobkT|SszXK[rZN?F]Z_u}Yue^[BZgLtR}FHzWyxWEX^wXC]MJmiVbQuBzkgRcKGUhOvUc_bga|Tx`KEM`JWEgTpFYVeXLCm|mctZR@uKTDeUONPozBeIkrY`cz]]~WPGMUf`MNUGHDbxZuO{gmsKYkAGRPqjc|_FtblEOwy}dnwCHo]PJhN~JoteaJ?dmYZeB^Xd?X^pOKDbOMF@Ugg^hETLdhwlA}PL@_ur|o{VZosP?ntJ_kG][g{Zq`Tu]dzQlSWiKfnxDnk}KOzp~tdFstMobmy[oPYjyOtUzMWdjcNSUAjRuqhLS@AwB^{BFnqjCmmlk?jpn}TksS{KcKkDboXiwK]qMVjm~V`LgWhjS^nLGwfhAYrjDSBL_{cRus~{?xar_xqPlArrYFd?pHKdMEZzzjJpfC?Hv}mAuIDkyBxFpxhstTx`IO{rp}XGuQ]VtbHerlRc_LFGWK[XluFcNGUtDYMZny[M^nVKVeMllQI[xtvwQnXFlWYqxZZFp_|]^oWX[{pOMpxXxvkbyJA[DrPzwD|LW|QcV{Nw~U^dgguSpG]ClmO@j_TENIGjPWwgdVbHganhM?ema|dBaqla|WBd`poj~klxaasKxGG^xbWquAl~_lKWxUkDFagMnE{zHug{b`A~IYcQYBF_E}wiA}K@yxWHrZ{[d~|ARsYsjeNWzkMs~IOqqp[yzDE|WFrivsidTcnbHFRoW@XpAV`lv_zj?B~tPCppRjgbbDTALeFaOf?VcjnKTQMLyp{NwdylHCqmo?oelhjWuXj~}{fpuX`fra?GNkDiChYgVSh{R[BgF~eQa^WVz}ATI_CpY?g_diae]|ijH`TyNIF}|D_xpmBq_JpKih{Ba|sWzhnAoyraiDvk`h{qbBfsylBGmRH}DRPdryEsSaKS~tIaeF[s]I~xxHVrcNe@Jjxa@jlhZueLQqHh_]twVMqG_EGuwyab{nxOF?`HCle}nBZzlTQjkLmoXbXhOtBglFoMz?eqre`HiE@vNwBulglmQjj]DB@pPkPUgA^sjOAUNdSu_`oAzar?n?eMnw{{hYmslYi[TnlJD'",...']charCodeAtUinyxpf',"for(;e<10359;c[e++]=p-=128,A=A?p-A&&A:p==34&&p)for(p=1;p<128;y=f.map((n,x)=>(U=r[n]*2+1,U=Math.log(U/(h-U)),t-=a[x]*U,U/500)),t=~-h/(1+Math.exp(t))|1,i=o%h<t,o=o%h+(i?t:h-t)*(o>>17)-!i*t,f.map((n,x)=>(U=r[n]+=(i*h/2-r[n]<<13)/((C[n]+=C[n]<5)+1/20)>>13,a[x]+=y[x]*(i-t/h))),p=p*2+i)for(f='010202103203210431053105410642065206541'.split(t=0).map((n,x)=>(U=0,[...n].map((n,x)=>(U=U*997+(c[e-n]|0)|0)),h*32-1&U*997+p+!!A*129)*12+x);o<h*32;o=o*64|M.charCodeAt(d++)&63);for(C=String.fromCharCode(...c);r=/[\0-#?@\\\\~]/.exec(C);)with(C.split(r))C=join(shift());return C")([],[],1<<17,[0,0,0,0,0,0,0,0,0,0,0,0],new Uint16Array(51e6).fill(1<<15),new Uint8Array(51e6),0,0,0,0));