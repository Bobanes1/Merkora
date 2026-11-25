/**
 * Interactive Periodic Table of all 118 chemical elements (German names, categories, states, shells)
 * + direct adapter to Merkora's animated `orbit` Bohr shell diagram. Pure – tested in scripts/test-srs.mts.
 */
import type { Diagram } from './diagram';

export type ElementCat =
  | 'alkali'
  | 'alkaline'
  | 'transition'
  | 'post'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble'
  | 'lanthanide'
  | 'actinide';

export type ChemElement = {
  z: number;
  sym: string;
  name: string;
  mass: number;
  cat: ElementCat;
  state: 'fest' | 'flüssig' | 'gasförmig';
  en?: number;
  /** Grid column 1..18 */
  col: number;
  /** Grid row 1..7 (8 = Lanthanoids, 9 = Actinoids) */
  row: number;
  shells: number[];
  note: string;
};

export const ELEMENT_CAT_LABEL: Record<ElementCat, string> = {
  alkali: 'Alkalimetalle',
  alkaline: 'Erdalkalimetalle',
  transition: 'Übergangsmetalle',
  post: 'Sonstige Metalle',
  metalloid: 'Halbmetalle',
  nonmetal: 'Nichtmetalle',
  halogen: 'Halogene',
  noble: 'Edelgase',
  lanthanide: 'Lanthanoide',
  actinide: 'Actinoide',
};

const SHELL_NAMES = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

type Row = [number, string, string, number, ElementCat, 'f' | 'l' | 'g', number | null, number, number, number[], string?];

const RAW: Row[] = [
  [1,'H','Wasserstoff',1.008,'nonmetal','g',2.2,1,1,[1],'Häufigstes Element im Universum – Brennstoff der Sonne.'],
  [2,'He','Helium',4.003,'noble','g',null,18,1,[2],'Sehr leichtes, unbrennbares Edelgas (Ballons, Kühlung).'],
  [3,'Li','Lithium',6.94,'alkali','f',0.98,1,2,[2,1],'Leichtestes Metall – Schlüsselmaterial für moderne Akkus.'],
  [4,'Be','Beryllium',9.012,'alkaline','f',1.57,2,2,[2,2],'Sehr leichtes, steifes Metall für Luft- und Raumfahrt.'],
  [5,'B','Bor',10.81,'metalloid','f',2.04,13,2,[2,3],'Halbmetall – macht Borosilikatglas hitzebeständig.'],
  [6,'C','Kohlenstoff',12.011,'nonmetal','f',2.55,14,2,[2,4],'Grundbaustein allen Lebens (DNA, Proteine, Diamant, Graphit).'],
  [7,'N','Stickstoff',14.007,'nonmetal','g',3.04,15,2,[2,5],'Macht rund 78 % unserer Atemluft aus.'],
  [8,'O','Sauerstoff',15.999,'nonmetal','g',3.44,16,2,[2,6],'Etwa 21 % der Luft – lebensnotwendig für die Zellatmung.'],
  [9,'F','Fluor',18.998,'halogen','g',3.98,17,2,[2,7],'Reaktivstes Element überhaupt; in Zahnpasta als Fluorid.'],
  [10,'Ne','Neon',20.18,'noble','g',null,18,2,[2,8],'Leuchtet in Gasentladungsröhren intensiv orangerot.'],
  [11,'Na','Natrium',22.99,'alkali','f',0.93,1,3,[2,8,1],'Reagiert heftig mit Wasser; Teil von Kochsalz (NaCl).'],
  [12,'Mg','Magnesium',24.305,'alkaline','f',1.31,2,3,[2,8,2],'Zentralatom im Chlorophyll – wichtig für Muskeln & Nerven.'],
  [13,'Al','Aluminium',26.982,'post','f',1.61,13,3,[2,8,3],'Häufigstes Metall der Erdkruste – leicht & korrosionsfest.'],
  [14,'Si','Silicium',28.085,'metalloid','f',1.9,14,3,[2,8,4],'Halbleiter-Grundlage aller Mikrochips und Solarzellen.'],
  [15,'P','Phosphor',30.974,'nonmetal','f',2.19,15,3,[2,8,5],'Bestandteil von DNA, ATP (Energieträger) und Knochen.'],
  [16,'S','Schwefel',32.06,'nonmetal','f',2.58,16,3,[2,8,6],'Gelbes Nichtmetall – wichtig für Aminosäuren und Vulkanismus.'],
  [17,'Cl','Chlor',35.45,'halogen','g',3.16,17,3,[2,8,7],'Desinfektionsmittel und Partner von Natrium im Kochsalz (NaCl).'],
  [18,'Ar','Argon',39.948,'noble','g',null,18,3,[2,8,8],'Etwa 0,9 % der Luft – beliebtes Schutzgas beim Schweißen.'],
  [19,'K','Kalium',39.098,'alkali','f',0.82,1,4,[2,8,8,1],'Unverzichtbar für Nervenimpulse und Pflanzenwachstum.'],
  [20,'Ca','Calcium',40.078,'alkaline','f',1.0,2,4,[2,8,8,2],'Baustoff für Knochen, Zähne und Kalkstein.'],
  [21,'Sc','Scandium',44.956,'transition','f',1.36,3,4,[2,8,9,2]],
  [22,'Ti','Titan',47.867,'transition','f',1.54,4,4,[2,8,10,2],'Extrem fest, leicht und biokompatibel (Implantate, Flugzeuge).'],
  [23,'V','Vanadium',50.942,'transition','f',1.63,5,4,[2,8,11,2]],
  [24,'Cr','Chrom',51.996,'transition','f',1.66,6,4,[2,8,13,1],'Macht Edelstahl rostfrei und glänzend.'],
  [25,'Mn','Mangan',54.938,'transition','f',1.55,7,4,[2,8,13,2]],
  [26,'Fe','Eisen',55.845,'transition','f',1.83,8,4,[2,8,14,2],'Wichtigstes Gebrauchsmetall (Stahl) und Sauerstoffträger im Hämoglobin.'],
  [27,'Co','Cobalt',58.933,'transition','f',1.88,9,4,[2,8,15,2]],
  [28,'Ni','Nickel',58.693,'transition','f',1.91,10,4,[2,8,16,2]],
  [29,'Cu','Kupfer',63.546,'transition','f',1.9,11,4,[2,8,18,1],'Hervorragender Strom- und Wärmeleiter (Kabel, Leitungen).'],
  [30,'Zn','Zink',65.38,'transition','f',1.65,12,4,[2,8,18,2],'Schützt Stahl vor Rost (Verzinken) und stärkt das Immunsystem.'],
  [31,'Ga','Gallium',69.723,'post','f',1.81,13,4,[2,8,18,3],'Schmilzt schon bei 29,8 °C in der warmen Hand!'],
  [32,'Ge','Germanium',72.63,'metalloid','f',2.01,14,4,[2,8,18,4]],
  [33,'As','Arsen',74.922,'metalloid','f',2.18,15,4,[2,8,18,5]],
  [34,'Se','Selen',78.971,'nonmetal','f',2.55,16,4,[2,8,18,6]],
  [35,'Br','Brom',79.904,'halogen','l',2.96,17,4,[2,8,18,7],'Eines von nur zwei bei Raumtemperatur flüssigen Elementen.'],
  [36,'Kr','Krypton',83.798,'noble','g',3.0,18,4,[2,8,18,8]],
  [37,'Rb','Rubidium',85.468,'alkali','f',0.82,1,5,[2,8,18,8,1]],
  [38,'Sr','Strontium',87.62,'alkaline','f',0.95,2,5,[2,8,18,8,2]],
  [39,'Y','Yttrium',88.906,'transition','f',1.22,3,5,[2,8,18,9,2]],
  [40,'Zr','Zirconium',91.224,'transition','f',1.33,4,5,[2,8,18,10,2]],
  [41,'Nb','Niob',92.906,'transition','f',1.6,5,5,[2,8,18,12,1]],
  [42,'Mo','Molybdän',95.95,'transition','f',2.16,6,5,[2,8,18,13,1]],
  [43,'Tc','Technetium',98,'transition','f',1.9,7,5,[2,8,18,13,2]],
  [44,'Ru','Ruthenium',101.07,'transition','f',2.2,8,5,[2,8,18,15,1]],
  [45,'Rh','Rhodium',102.91,'transition','f',2.28,9,5,[2,8,18,16,1]],
  [46,'Pd','Palladium',106.42,'transition','f',2.2,10,5,[2,8,18,18]],
  [47,'Ag','Silber',107.87,'transition','f',1.93,11,5,[2,8,18,18,1],'Höchste elektrische Leitfähigkeit aller Metalle.'],
  [48,'Cd','Cadmium',112.41,'transition','f',1.69,12,5,[2,8,18,18,2]],
  [49,'In','Indium',114.82,'post','f',1.78,13,5,[2,8,18,18,3]],
  [50,'Sn','Zinn',118.71,'post','f',1.96,14,5,[2,8,18,18,4],'Bestandteil von Bronze und Lötzinn.'],
  [51,'Sb','Antimon',121.76,'metalloid','f',2.05,15,5,[2,8,18,18,5]],
  [52,'Te','Tellur',127.6,'metalloid','f',2.1,16,5,[2,8,18,18,6]],
  [53,'I','Iod',126.9,'halogen','f',2.66,17,5,[2,8,18,18,7],'Wichtiges Spurenelement für die Schilddrüse.'],
  [54,'Xe','Xenon',131.29,'noble','g',2.6,18,5,[2,8,18,18,8],'Genutzt in Xenon-Scheinwerfern und Ionentriebwerken.'],
  [55,'Cs','Caesium',132.91,'alkali','f',0.79,1,6,[2,8,18,18,8,1],'Definiert über seine Atomschwingung die Sekunde (Atomuhr).'],
  [56,'Ba','Barium',137.33,'alkaline','f',0.89,2,6,[2,8,18,18,8,2]],
  [57,'La','Lanthan',138.91,'lanthanide','f',1.1,4,8,[2,8,18,18,9,2]],
  [58,'Ce','Cer',140.12,'lanthanide','f',1.12,5,8,[2,8,18,19,9,2]],
  [59,'Pr','Praseodym',140.91,'lanthanide','f',1.13,6,8,[2,8,18,21,8,2]],
  [60,'Nd','Neodym',144.24,'lanthanide','f',1.14,7,8,[2,8,18,22,8,2],'Ermöglicht extrem starke Dauermagnete (Kopfhörer, Windräder).'],
  [61,'Pm','Promethium',145,'lanthanide','f',1.13,8,8,[2,8,18,23,8,2]],
  [62,'Sm','Samarium',150.36,'lanthanide','f',1.17,9,8,[2,8,18,24,8,2]],
  [63,'Eu','Europium',151.96,'lanthanide','f',1.2,10,8,[2,8,18,25,8,2]],
  [64,'Gd','Gadolinium',157.25,'lanthanide','f',1.2,11,8,[2,8,18,25,9,2]],
  [65,'Tb','Terbium',158.93,'lanthanide','f',1.2,12,8,[2,8,18,27,8,2]],
  [66,'Dy','Dysprosium',162.5,'lanthanide','f',1.22,13,8,[2,8,18,28,8,2]],
  [67,'Ho','Holmium',164.93,'lanthanide','f',1.23,14,8,[2,8,18,29,8,2]],
  [68,'Er','Erbium',167.26,'lanthanide','f',1.24,15,8,[2,8,18,30,8,2]],
  [69,'Tm','Thulium',168.93,'lanthanide','f',1.25,16,8,[2,8,18,31,8,2]],
  [70,'Yb','Ytterbium',173.05,'lanthanide','f',1.1,17,8,[2,8,18,32,8,2]],
  [71,'Lu','Lutetium',174.97,'lanthanide','f',1.27,18,8,[2,8,18,32,9,2]],
  [72,'Hf','Hafnium',178.49,'transition','f',1.3,4,6,[2,8,18,32,10,2]],
  [73,'Ta','Tantal',180.95,'transition','f',1.5,5,6,[2,8,18,32,11,2]],
  [74,'W','Wolfram',183.84,'transition','f',2.36,6,6,[2,8,18,32,12,2],'Höchster Schmelzpunkt aller Metalle (3422 °C – Glühfäden).'],
  [75,'Re','Rhenium',186.21,'transition','f',1.9,7,6,[2,8,18,32,13,2]],
  [76,'Os','Osmium',190.23,'transition','f',2.2,8,6,[2,8,18,32,14,2],'Dichtestes natürlich vorkommendes Element.'],
  [77,'Ir','Iridium',192.22,'transition','f',2.2,9,6,[2,8,18,32,15,2]],
  [78,'Pt','Platin',195.08,'transition','f',2.28,10,6,[2,8,18,32,17,1],'Wertvolles Edelmetall für Katalysatoren und Schmuck.'],
  [79,'Au','Gold',196.97,'transition','f',2.54,11,6,[2,8,18,32,18,1],'Rostet nicht, extrem gut formbar (Blattgold) und leitfähig.'],
  [80,'Hg','Quecksilber',200.59,'transition','l',2.0,12,6,[2,8,18,32,18,2],'Einziges bei Raumtemperatur flüssiges Metall.'],
  [81,'Tl','Thallium',204.38,'post','f',1.62,13,6,[2,8,18,32,18,3]],
  [82,'Pb','Blei',207.2,'post','f',2.33,14,6,[2,8,18,32,18,4],'Sehr schweres, weiches Metall – schirmt Röntgenstrahlung ab.'],
  [83,'Bi','Bismut',208.98,'post','f',2.02,15,6,[2,8,18,32,18,5]],
  [84,'Po','Polonium',209,'post','f',2.0,16,6,[2,8,18,32,18,6]],
  [85,'At','Astat',210,'halogen','f',2.2,17,6,[2,8,18,32,18,7]],
  [86,'Rn','Radon',222,'noble','g',2.2,18,6,[2,8,18,32,18,8]],
  [87,'Fr','Francium',223,'alkali','f',0.7,1,7,[2,8,18,32,18,8,1]],
  [88,'Ra','Radium',226,'alkaline','f',0.9,2,7,[2,8,18,32,18,8,2]],
  [89,'Ac','Actinium',227,'actinide','f',1.1,4,9,[2,8,18,32,18,9,2]],
  [90,'Th','Thorium',232.04,'actinide','f',1.3,5,9,[2,8,18,32,18,10,2]],
  [91,'Pa','Protactinium',231.04,'actinide','f',1.5,6,9,[2,8,18,32,20,9,2]],
  [92,'U','Uran',238.03,'actinide','f',1.38,7,9,[2,8,18,32,21,9,2],'Schwerstes häufiges natürliches Element – Kernbrennstoff.'],
  [93,'Np','Neptunium',237,'actinide','f',1.36,8,9,[2,8,18,32,22,9,2]],
  [94,'Pu','Plutonium',244,'actinide','f',1.28,9,9,[2,8,18,32,24,8,2]],
  [95,'Am','Americium',243,'actinide','f',1.3,10,9,[2,8,18,32,25,8,2]],
  [96,'Cm','Curium',247,'actinide','f',1.3,11,9,[2,8,18,32,25,9,2]],
  [97,'Bk','Berkelium',247,'actinide','f',1.3,12,9,[2,8,18,32,27,8,2]],
  [98,'Cf','Californium',251,'actinide','f',1.3,13,9,[2,8,18,32,28,8,2]],
  [99,'Es','Einsteinium',252,'actinide','f',1.3,14,9,[2,8,18,32,29,8,2]],
  [100,'Fm','Fermium',257,'actinide','f',1.3,15,9,[2,8,18,32,30,8,2]],
  [101,'Md','Mendelevium',258,'actinide','f',1.3,16,9,[2,8,18,32,31,8,2]],
  [102,'No','Nobelium',259,'actinide','f',1.3,17,9,[2,8,18,32,32,8,2]],
  [103,'Lr','Lawrencium',266,'actinide','f',1.3,18,9,[2,8,18,32,32,8,3]],
  [104,'Rf','Rutherfordium',267,'transition','f',null,4,7,[2,8,18,32,32,10,2]],
  [105,'Db','Dubnium',268,'transition','f',null,5,7,[2,8,18,32,32,11,2]],
  [106,'Sg','Seaborgium',269,'transition','f',null,6,7,[2,8,18,32,32,12,2]],
  [107,'Bh','Bohrium',270,'transition','f',null,7,7,[2,8,18,32,32,13,2]],
  [108,'Hs','Hassium',277,'transition','f',null,8,7,[2,8,18,32,32,14,2]],
  [109,'Mt','Meitnerium',278,'transition','f',null,9,7,[2,8,18,32,32,15,2]],
  [110,'Ds','Darmstadtium',281,'transition','f',null,10,7,[2,8,18,32,32,17,1]],
  [111,'Rg','Roentgenium',282,'transition','f',null,11,7,[2,8,18,32,32,18,1]],
  [112,'Cn','Copernicium',285,'transition','f',null,12,7,[2,8,18,32,32,18,2]],
  [113,'Nh','Nihonium',286,'post','f',null,13,7,[2,8,18,32,32,18,3]],
  [114,'Fl','Flerovium',289,'post','f',null,14,7,[2,8,18,32,32,18,4]],
  [115,'Mc','Moscovium',290,'post','f',null,15,7,[2,8,18,32,32,18,5]],
  [116,'Lv','Livermorium',293,'post','f',null,16,7,[2,8,18,32,32,18,6]],
  [117,'Ts','Tenness',294,'halogen','f',null,17,7,[2,8,18,32,32,18,7]],
  [118,'Og','Oganesson',294,'noble','g',null,18,7,[2,8,18,32,32,18,8],'Schwerstes bekanntes Element (künstlich erzeugt).'],
];

const STATE_MAP = { f: 'fest', l: 'flüssig', g: 'gasförmig' } as const;

export const ELEMENTS: ChemElement[] = RAW.map(([z, sym, name, mass, cat, st, en, col, row, shells, note]) => ({
  z,
  sym,
  name,
  mass,
  cat,
  state: STATE_MAP[st],
  ...(en !== null ? { en } : {}),
  col,
  row,
  shells,
  note: note ?? `${ELEMENT_CAT_LABEL[cat]} · Ordnungszahl ${z} (${shells.length} Elektronenschalen).`,
}));

/** Converts any chemical element into an animated Merkora `orbit` Bohr shell diagram. */
export function elementOrbitDiagram(el: ChemElement): Diagram {
  const shown = el.shells.slice(0, 5);
  const lastIdx = el.shells.length - 1;
  return {
    type: 'orbit',
    title: `Schalenmodell: ${el.name} (${el.sym})`,
    center: `Kern (${el.z} p⁺)`,
    rings: shown.map((cnt, idx) => ({
      label: `${SHELL_NAMES[idx]}-Schale (${cnt} e⁻)`,
      count: Math.min(6, Math.max(1, cnt)),
      ...(idx === lastIdx ? { note: 'Valenzschale' } : {}),
    })),
    highlight: `${SHELL_NAMES[Math.min(4, lastIdx)]}-Schale (${shown[shown.length - 1]} e⁻)`,
  };
}
