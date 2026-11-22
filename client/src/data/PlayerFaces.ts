// Striker FC — data/PlayerFaces.ts
// Real photo portraits for the top stars (personal play only — the game
// is not published). Photos live in client/src/assets/faces/<slug>.jpg
// (1024x1024 JPEG, square head-and-shoulders crop, sourced from Wikipedia
// page images, with 3 fallbacks from image search). The in-match 3D rig
// keeps its painted faces; these photos are for UI portraits only:
// PlayerCard (cards / squad / market / packs) and the PlayerShowcase
// WebGL fallback + goal-celebration portrait. Any player without a photo
// here falls back to the existing painted AthletePortrait — never blank.

import alissonUrl from '../assets/faces/alisson.jpg';
import barellaUrl from '../assets/faces/barella.jpg';
import bellinghamUrl from '../assets/faces/bellingham.jpg';
import bfernandesUrl from '../assets/faces/bfernandes.jpg';
import bsilvaUrl from '../assets/faces/bsilva.jpg';
import calhanogluUrl from '../assets/faces/calhanoglu.jpg';
import courtoisUrl from '../assets/faces/courtois.jpg';
import cruyffUrl from '../assets/faces/cruyff.jpg';
import daviesUrl from '../assets/faces/davies.jpg';
import debruyneUrl from '../assets/faces/debruyne.jpg';
import dembeleUrl from '../assets/faces/dembele.jpg';
import donnarummaUrl from '../assets/faces/donnarumma.jpg';
import emartinezUrl from '../assets/faces/emartinez.jpg';
import fdjongUrl from '../assets/faces/fdjong.jpg';
import fodenUrl from '../assets/faces/foden.jpg';
import gakpoUrl from '../assets/faces/gakpo.jpg';
import griezmannUrl from '../assets/faces/griezmann.jpg';
import haalandUrl from '../assets/faces/haaland.jpg';
import hakimiUrl from '../assets/faces/hakimi.jpg';
import hamzaUrl from '../assets/faces/hamza.jpg';
import jalvarezUrl from '../assets/faces/jalvarez.jpg';
import jamalUrl from '../assets/faces/jamal.jpg';
import kaneUrl from '../assets/faces/kane.jpg';
import kimmichUrl from '../assets/faces/kimmich.jpg';
import kroosUrl from '../assets/faces/kroos.jpg';
import kvaratskheliaUrl from '../assets/faces/kvaratskhelia.jpg';
import lautaroUrl from '../assets/faces/lautaro.jpg';
import ldiazUrl from '../assets/faces/ldiaz.jpg';
import leaoUrl from '../assets/faces/leao.jpg';
import lewandowskiUrl from '../assets/faces/lewandowski.jpg';
import lookmanUrl from '../assets/faces/lookman.jpg';
import maignanUrl from '../assets/faces/maignan.jpg';
import mamardashviliUrl from '../assets/faces/mamardashvili.jpg';
import maneUrl from '../assets/faces/mane.jpg';
import maradonaUrl from '../assets/faces/maradona.jpg';
import mbappeUrl from '../assets/faces/mbappe.jpg';
import messiUrl from '../assets/faces/messi.jpg';
import mitulUrl from '../assets/faces/mitul.jpg';
import modricUrl from '../assets/faces/modric.jpg';
import morsalinUrl from '../assets/faces/morsalin.jpg';
import musialaUrl from '../assets/faces/musiala.jpg';
import neymarUrl from '../assets/faces/neymar.jpg';
import nwilliamsUrl from '../assets/faces/nwilliams.jpg';
import odegaardUrl from '../assets/faces/odegaard.jpg';
import osimhenUrl from '../assets/faces/osimhen.jpg';
import palmerUrl from '../assets/faces/palmer.jpg';
import pedriUrl from '../assets/faces/pedri.jpg';
import peleUrl from '../assets/faces/pele.jpg';
import raphinhaUrl from '../assets/faces/raphinha.jpg';
import rakibUrl from '../assets/faces/rakib.jpg';
import rashfordUrl from '../assets/faces/rashford.jpg';
import rdiasUrl from '../assets/faces/rdias.jpg';
import riceUrl from '../assets/faces/rice.jpg';
import rodriUrl from '../assets/faces/rodri.jpg';
import rodrygoUrl from '../assets/faces/rodrygo.jpg';
import ronaldinhoUrl from '../assets/faces/ronaldinho.jpg';
import ronaldoUrl from '../assets/faces/ronaldo.jpg';
import sakaUrl from '../assets/faces/saka.jpg';
import salahUrl from '../assets/faces/salah.jpg';
import salibaUrl from '../assets/faces/saliba.jpg';
import saneUrl from '../assets/faces/sane.jpg';
import sommerUrl from '../assets/faces/sommer.jpg';
import sohelUrl from '../assets/faces/sohel.jpg';
import sonUrl from '../assets/faces/son.jpg';
import stonesUrl from '../assets/faces/stones.jpg';
import szczesnyUrl from '../assets/faces/szczesny.jpg';
import taaUrl from '../assets/faces/taa.jpg';
import terstegenUrl from '../assets/faces/terstegen.jpg';
import topuUrl from '../assets/faces/topu.jpg';
import valverdeUrl from '../assets/faces/valverde.jpg';
import vandijkUrl from '../assets/faces/vandijk.jpg';
import viniciusUrl from '../assets/faces/vinicius.jpg';
import wirtzUrl from '../assets/faces/wirtz.jpg';
import xhakaUrl from '../assets/faces/xhaka.jpg';
import yamalUrl from '../assets/faces/yamal.jpg';
import zidaneUrl from '../assets/faces/zidane.jpg';

/** Template id (rw_*) -> photo URL. Every photo has a DB entry in RealPlayers.ts. */
export const PLAYER_FACE_URLS: Record<string, string> = {
  'rw_alisson': alissonUrl,
  'rw_barella': barellaUrl,
  'rw_bellingham': bellinghamUrl,
  'rw_bfernandes': bfernandesUrl,
  'rw_bsilva': bsilvaUrl,
  'rw_calhanoglu': calhanogluUrl,
  'rw_courtois': courtoisUrl,
  'rw_cruyff': cruyffUrl,
  'rw_debruyne': debruyneUrl,
  'rw_davies': daviesUrl,
  'rw_dembele': dembeleUrl,
  'rw_donnarumma': donnarummaUrl,
  'rw_emartinez': emartinezUrl,
  'rw_fdjong': fdjongUrl,
  'rw_foden': fodenUrl,
  'rw_gakpo': gakpoUrl,
  'rw_griezmann': griezmannUrl,
  'rw_haaland': haalandUrl,
  'rw_hakimi': hakimiUrl,
  'rw_hamza': hamzaUrl,
  'rw_jalvarez': jalvarezUrl,
  'rw_jamal': jamalUrl,
  'rw_kane': kaneUrl,
  'rw_kimmich': kimmichUrl,
  'rw_kroos': kroosUrl,
  'rw_kvaratskhelia': kvaratskheliaUrl,
  'rw_lautaro': lautaroUrl,
  'rw_ldiaz': ldiazUrl,
  'rw_leao': leaoUrl,
  'rw_lewandowski': lewandowskiUrl,
  'rw_lookman': lookmanUrl,
  'rw_maignan': maignanUrl,
  'rw_mamardashvili': mamardashviliUrl,
  'rw_mane': maneUrl,
  'rw_maradona': maradonaUrl,
  'rw_mbappe': mbappeUrl,
  'rw_messi': messiUrl,
  'rw_mitul': mitulUrl,
  'rw_modric': modricUrl,
  'rw_morsalin': morsalinUrl,
  'rw_musiala': musialaUrl,
  'rw_neymar': neymarUrl,
  'rw_nwilliams': nwilliamsUrl,
  'rw_odegaard': odegaardUrl,
  'rw_osimhen': osimhenUrl,
  'rw_palmer': palmerUrl,
  'rw_pedri': pedriUrl,
  'rw_pele': peleUrl,
  'rw_raphinha': raphinhaUrl,
  'rw_rakib': rakibUrl,
  'rw_rashford': rashfordUrl,
  'rw_rdias': rdiasUrl,
  'rw_rice': riceUrl,
  'rw_rodri': rodriUrl,
  'rw_rodrygo': rodrygoUrl,
  'rw_ronaldinho': ronaldinhoUrl,
  'rw_ronaldo': ronaldoUrl,
  'rw_saka': sakaUrl,
  'rw_salah': salahUrl,
  'rw_saliba': salibaUrl,
  'rw_sane': saneUrl,
  'rw_sommer': sommerUrl,
  'rw_sohel': sohelUrl,
  'rw_son': sonUrl,
  'rw_stones': stonesUrl,
  'rw_szczesny': szczesnyUrl,
  'rw_taa': taaUrl,
  'rw_terstegen': terstegenUrl,
  'rw_topu': topuUrl,
  'rw_valverde': valverdeUrl,
  'rw_vandijk': vandijkUrl,
  'rw_vinicius': viniciusUrl,
  'rw_wirtz': wirtzUrl,
  'rw_xhaka': xhakaUrl,
  'rw_yamal': yamalUrl,
  'rw_zidane': zidaneUrl,
};

/** Photo URL for a player template id, or undefined when no photo exists. */
export function facePhotoUrlFor(templateId: string): string | undefined {
  if (PLAYER_FACE_URLS[templateId]) return PLAYER_FACE_URLS[templateId];
  const slug = templateId.replace(/^rw_/, '');
  return PLAYER_FACE_URLS[`rw_${slug}`] ?? PLAYER_FACE_URLS[slug];
}

export const PLAYER_FACE_COUNT = 76;
