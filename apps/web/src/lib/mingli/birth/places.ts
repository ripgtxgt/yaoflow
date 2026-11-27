/**
 * 10-18 进度表 71–74 生辰输入层: birthplaces with latitude, longitude and IANA time zone. Taiwan (22 counties and cities,
 * seat coordinates), Hong Kong (18 districts), Macau, main mainland cities, and common overseas cities. Coordinates are
 * the city or district seat to about 0.01° (≈1 km), which is far finer than the charts need (0.1° ≈ 0.4 minutes of
 * true solar time). Written by 开发 from public gazetteer values; names are Taiwan usage.
 */
export type PlaceGroup = "tw" | "hk" | "mo" | "cn" | "intl";
export interface Place { id: string; name: string; group: PlaceGroup; region?: string; lat: number; lon: number; tz: string }

const TW = "Asia/Taipei", HK = "Asia/Hong_Kong", CN = "Asia/Shanghai";
const p = (id: string, name: string, group: PlaceGroup, lat: number, lon: number, tz: string, region?: string): Place => ({ id, name, group, lat, lon, tz, region });

export const PLACES: Place[] = [
  // 台灣
  p("tw-tpe", "臺北市", "tw", 25.04, 121.56, TW), p("tw-ntpc", "新北市", "tw", 25.01, 121.46, TW), p("tw-tyn", "桃園市", "tw", 24.99, 121.30, TW),
  p("tw-txg", "臺中市", "tw", 24.15, 120.67, TW), p("tw-tnn", "臺南市", "tw", 22.99, 120.21, TW), p("tw-khh", "高雄市", "tw", 22.63, 120.30, TW),
  p("tw-kel", "基隆市", "tw", 25.13, 121.74, TW), p("tw-hsz", "新竹市", "tw", 24.80, 120.97, TW), p("tw-cyi", "嘉義市", "tw", 23.48, 120.45, TW),
  p("tw-hsq", "新竹縣", "tw", 24.83, 121.01, TW), p("tw-mia", "苗栗縣", "tw", 24.56, 120.82, TW), p("tw-cha", "彰化縣", "tw", 24.08, 120.54, TW),
  p("tw-nan", "南投縣", "tw", 23.91, 120.68, TW), p("tw-yun", "雲林縣", "tw", 23.71, 120.54, TW), p("tw-cyq", "嘉義縣", "tw", 23.46, 120.25, TW),
  p("tw-pif", "屏東縣", "tw", 22.67, 120.49, TW), p("tw-ila", "宜蘭縣", "tw", 24.75, 121.75, TW), p("tw-hua", "花蓮縣", "tw", 23.99, 121.60, TW),
  p("tw-ttt", "臺東縣", "tw", 22.76, 121.14, TW), p("tw-pen", "澎湖縣", "tw", 23.57, 119.58, TW), p("tw-kin", "金門縣", "tw", 24.44, 118.32, TW),
  p("tw-lie", "連江縣", "tw", 26.16, 119.95, TW),
  // 香港 18 區
  p("hk-cw", "中西區", "hk", 22.28, 114.15, HK), p("hk-wc", "灣仔區", "hk", 22.28, 114.18, HK), p("hk-east", "東區", "hk", 22.28, 114.22, HK),
  p("hk-south", "南區", "hk", 22.25, 114.16, HK), p("hk-ytm", "油尖旺區", "hk", 22.31, 114.17, HK), p("hk-ssp", "深水埗區", "hk", 22.33, 114.16, HK),
  p("hk-klc", "九龍城區", "hk", 22.33, 114.19, HK), p("hk-wts", "黃大仙區", "hk", 22.34, 114.19, HK), p("hk-kt", "觀塘區", "hk", 22.31, 114.23, HK),
  p("hk-kwt", "葵青區", "hk", 22.36, 114.13, HK), p("hk-tw", "荃灣區", "hk", 22.37, 114.11, HK), p("hk-tm", "屯門區", "hk", 22.39, 113.97, HK),
  p("hk-yl", "元朗區", "hk", 22.44, 114.02, HK), p("hk-north", "北區", "hk", 22.50, 114.13, HK), p("hk-tp", "大埔區", "hk", 22.45, 114.17, HK),
  p("hk-st", "沙田區", "hk", 22.38, 114.19, HK), p("hk-sk", "西貢區", "hk", 22.38, 114.27, HK), p("hk-is", "離島區", "hk", 22.26, 113.95, HK),
  // 澳門
  p("mo", "澳門", "mo", 22.20, 113.55, "Asia/Macau"),
  // 中國大陸（省／主要城市）
  ...([
    ["cn-bj", "北京", "北京", 39.90, 116.40], ["cn-sh", "上海", "上海", 31.23, 121.47], ["cn-tj", "天津", "天津", 39.13, 117.20], ["cn-cq", "重慶", "重慶", 29.56, 106.55],
    ["cn-gz", "廣州", "廣東", 23.13, 113.26], ["cn-sz", "深圳", "廣東", 22.54, 114.06], ["cn-dg", "東莞", "廣東", 23.02, 113.75], ["cn-fs", "佛山", "廣東", 23.02, 113.12], ["cn-st", "汕頭", "廣東", 23.35, 116.68], ["cn-mz", "梅州", "廣東", 24.29, 116.12], ["cn-zh", "珠海", "廣東", 22.27, 113.58],
    ["cn-fz", "福州", "福建", 26.07, 119.30], ["cn-xm", "廈門", "福建", 24.48, 118.09], ["cn-qz", "泉州", "福建", 24.87, 118.68], ["cn-zz", "漳州", "福建", 24.51, 117.65], ["cn-pt", "莆田", "福建", 25.45, 119.01],
    ["cn-hz", "杭州", "浙江", 30.27, 120.15], ["cn-nb", "寧波", "浙江", 29.87, 121.55], ["cn-wz", "溫州", "浙江", 28.00, 120.67],
    ["cn-nj", "南京", "江蘇", 32.06, 118.80], ["cn-suz", "蘇州", "江蘇", 31.30, 120.62], ["cn-wx", "無錫", "江蘇", 31.49, 120.31],
    ["cn-hf", "合肥", "安徽", 31.82, 117.23], ["cn-jn", "濟南", "山東", 36.65, 117.12], ["cn-qd", "青島", "山東", 36.07, 120.38],
    ["cn-wh", "武漢", "湖北", 30.59, 114.31], ["cn-cs", "長沙", "湖南", 28.23, 112.94], ["cn-nc", "南昌", "江西", 28.68, 115.86],
    ["cn-cd", "成都", "四川", 30.57, 104.07], ["cn-km", "昆明", "雲南", 25.04, 102.71], ["cn-gy", "貴陽", "貴州", 26.65, 106.63],
    ["cn-nn", "南寧", "廣西", 22.82, 108.37], ["cn-hk", "海口", "海南", 20.04, 110.32], ["cn-xa", "西安", "陝西", 34.34, 108.94],
    ["cn-zzh", "鄭州", "河南", 34.75, 113.63], ["cn-sjz", "石家莊", "河北", 38.04, 114.51], ["cn-ty", "太原", "山西", 37.87, 112.55],
    ["cn-sy", "瀋陽", "遼寧", 41.80, 123.43], ["cn-dl", "大連", "遼寧", 38.91, 121.61], ["cn-cc", "長春", "吉林", 43.82, 125.32],
    ["cn-hrb", "哈爾濱", "黑龍江", 45.80, 126.53], ["cn-lz", "蘭州", "甘肅", 36.06, 103.83], ["cn-xn", "西寧", "青海", 36.62, 101.78],
    ["cn-yc", "銀川", "寧夏", 38.49, 106.23], ["cn-hhht", "呼和浩特", "內蒙古", 40.84, 111.75], ["cn-wlmq", "烏魯木齊", "新疆", 43.83, 87.62],
    ["cn-ls", "拉薩", "西藏", 29.65, 91.14],
  ] as const).map(([id, name, region, lat, lon]) => p(id, name, "cn", lat, lon, CN, region)),
  // 其他國家地區
  ...([
    ["us-nyc", "紐約", "美國", 40.71, -74.01, "America/New_York"], ["us-bos", "波士頓", "美國", 42.36, -71.06, "America/New_York"], ["us-dc", "華盛頓", "美國", 38.91, -77.04, "America/New_York"],
    ["us-chi", "芝加哥", "美國", 41.88, -87.63, "America/Chicago"], ["us-hou", "休士頓", "美國", 29.76, -95.37, "America/Chicago"], ["us-dal", "達拉斯", "美國", 32.78, -96.80, "America/Chicago"],
    ["us-la", "洛杉磯", "美國", 34.05, -118.24, "America/Los_Angeles"], ["us-sf", "舊金山", "美國", 37.77, -122.42, "America/Los_Angeles"], ["us-sj", "聖荷西", "美國", 37.34, -121.89, "America/Los_Angeles"],
    ["us-sea", "西雅圖", "美國", 47.61, -122.33, "America/Los_Angeles"], ["us-hnl", "檀香山", "美國", 21.31, -157.86, "Pacific/Honolulu"], ["us-phx", "鳳凰城", "美國", 33.45, -112.07, "America/Phoenix"],
    ["ca-yvr", "溫哥華", "加拿大", 49.28, -123.12, "America/Vancouver"], ["ca-yyz", "多倫多", "加拿大", 43.65, -79.38, "America/Toronto"], ["ca-yul", "蒙特婁", "加拿大", 45.50, -73.57, "America/Toronto"], ["ca-yyc", "卡加利", "加拿大", 51.05, -114.07, "America/Edmonton"],
    ["au-syd", "雪梨", "澳洲", -33.87, 151.21, "Australia/Sydney"], ["au-mel", "墨爾本", "澳洲", -37.81, 144.96, "Australia/Melbourne"], ["au-bne", "布里斯本", "澳洲", -27.47, 153.03, "Australia/Brisbane"], ["au-per", "伯斯", "澳洲", -31.95, 115.86, "Australia/Perth"],
    ["nz-akl", "奧克蘭", "紐西蘭", -36.85, 174.76, "Pacific/Auckland"],
    ["jp-tyo", "東京", "日本", 35.68, 139.69, "Asia/Tokyo"], ["jp-osa", "大阪", "日本", 34.69, 135.50, "Asia/Tokyo"], ["jp-fuk", "福岡", "日本", 33.59, 130.40, "Asia/Tokyo"], ["jp-oka", "沖繩（那霸）", "日本", 26.21, 127.68, "Asia/Tokyo"],
    ["kr-sel", "首爾", "韓國", 37.57, 126.98, "Asia/Seoul"], ["kr-pus", "釜山", "韓國", 35.18, 129.08, "Asia/Seoul"],
    ["sg", "新加坡", "新加坡", 1.35, 103.82, "Asia/Singapore"], ["my-kul", "吉隆坡", "馬來西亞", 3.14, 101.69, "Asia/Kuala_Lumpur"], ["my-pen", "檳城", "馬來西亞", 5.41, 100.33, "Asia/Kuala_Lumpur"],
    ["th-bkk", "曼谷", "泰國", 13.76, 100.50, "Asia/Bangkok"], ["vn-sgn", "胡志明市", "越南", 10.82, 106.63, "Asia/Ho_Chi_Minh"], ["vn-han", "河內", "越南", 21.03, 105.85, "Asia/Bangkok"],
    ["ph-mnl", "馬尼拉", "菲律賓", 14.60, 120.98, "Asia/Manila"], ["id-jkt", "雅加達", "印尼", -6.21, 106.85, "Asia/Jakarta"], ["mm-rgn", "仰光", "緬甸", 16.87, 96.20, "Asia/Yangon"],
    ["in-del", "新德里", "印度", 28.61, 77.21, "Asia/Kolkata"], ["ae-dxb", "杜拜", "阿聯", 25.20, 55.27, "Asia/Dubai"],
    ["gb-lon", "倫敦", "英國", 51.51, -0.13, "Europe/London"], ["gb-man", "曼徹斯特", "英國", 53.48, -2.24, "Europe/London"], ["ie-dub", "都柏林", "愛爾蘭", 53.35, -6.26, "Europe/Dublin"],
    ["fr-par", "巴黎", "法國", 48.86, 2.35, "Europe/Paris"], ["de-ber", "柏林", "德國", 52.52, 13.40, "Europe/Berlin"], ["de-fra", "法蘭克福", "德國", 50.11, 8.68, "Europe/Berlin"], ["de-muc", "慕尼黑", "德國", 48.14, 11.58, "Europe/Berlin"],
    ["nl-ams", "阿姆斯特丹", "荷蘭", 52.37, 4.90, "Europe/Amsterdam"], ["it-rom", "羅馬", "義大利", 41.90, 12.50, "Europe/Rome"], ["es-mad", "馬德里", "西班牙", 40.42, -3.70, "Europe/Madrid"],
    ["ch-zrh", "蘇黎世", "瑞士", 47.38, 8.54, "Europe/Zurich"], ["se-sto", "斯德哥爾摩", "瑞典", 59.33, 18.07, "Europe/Stockholm"], ["is-rkv", "雷克雅維克", "冰島", 64.15, -21.94, "Atlantic/Reykjavik"],
    ["br-sao", "聖保羅", "巴西", -23.55, -46.63, "America/Sao_Paulo"], ["ar-bue", "布宜諾斯艾利斯", "阿根廷", -34.60, -58.38, "America/Argentina/Buenos_Aires"], ["za-jnb", "約翰尼斯堡", "南非", -26.20, 28.05, "Africa/Johannesburg"],
  ] as const).map(([id, name, region, lat, lon, tz]) => p(id, name, "intl", lat, lon, tz, region)),
];

export const placeById = (id: string): Place | null => PLACES.find((x) => x.id === id) ?? null;
export const GROUP_NAMES: Record<PlaceGroup, string> = { tw: "台灣", hk: "香港", mo: "澳門", cn: "中國大陸", intl: "其他國家地區" };
