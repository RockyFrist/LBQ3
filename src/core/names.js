// ===================== 古风中文名字库 =====================
// 随机生成古风人名，用于比武擂台、田忌赛马等娱乐模式

const SURNAMES = [
  '李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '徐', '孙', '马', '朱', '胡', '郭', '林', '何', '高', '罗',
  '郑', '梁', '谢', '宋', '唐', '韩', '曹', '许', '邓', '萧',
  '冯', '曾', '程', '蔡', '彭', '潘', '袁', '于', '董', '余',
  '苏', '叶', '吕', '魏', '蒋', '田', '杜', '丁', '沈', '姜',
  '范', '江', '傅', '钟', '卢', '汪', '戴', '崔', '任', '陆',
  '廖', '姚', '方', '金', '邱', '夏', '谭', '韦', '贾', '邹',
  '石', '熊', '孟', '秦', '阎', '薛', '侯', '雷', '白', '龙',
  '段', '郝', '孔', '邵', '史', '毛', '常', '万', '顾', '赖',
  '武', '康', '贺', '严', '尹', '钱', '施', '牛', '洪', '龚',
  // 复姓
  '欧阳', '上官', '司马', '诸葛', '令狐', '慕容', '皇甫', '东方', '公孙', '南宫',
  '独孤', '轩辕', '西门', '端木', '百里', '宇文',
];

const GIVEN_NAMES_MALE = [
  '云飞', '天行', '剑心', '无涯', '长风', '破军', '逸尘', '凌霄', '傲雪', '惊鸿',
  '青锋', '星河', '玄武', '烈阳', '寒江', '墨痕', '风吟', '龙渊', '虎啸', '鹰翔',
  '苍穹', '浩然', '子墨', '承志', '远山', '明远', '景行', '云深', '清风', '归尘',
  '问天', '凌云', '一鸣', '千钧', '弈秋', '若水', '知行', '长歌', '夜雨', '秋霜',
  '铁衣', '沧海', '孤鸿', '烽火', '残阳', '落霞', '飞鸿', '惊蛰', '雷音', '千里',
  '不悔', '无双', '绝影', '离歌', '断肠', '风华', '乘风', '踏雪', '望月', '听泉',
  '擎天', '翻云', '覆雨', '撼山', '裂石', '拔山', '冲霄', '摧城', '吞日', '逐月',
  '玄机', '天枢', '北斗', '南斗', '太虚', '无极', '混元', '乾坤', '太初', '鸿蒙',
  '修远', '致远', '文渊', '思齐', '守正', '立言', '弘毅', '笃行', '博文', '约礼',
  '霸先', '伯符', '仲达', '子龙', '奉先', '翼德', '公瑾', '元直', '孝直', '幼常',
];

const GIVEN_NAMES_FEMALE = [
  '飞雪', '凝霜', '冰心', '若兰', '紫烟', '碧落', '彩云', '月华', '星辰', '晚霞',
  '听雨', '寒梅', '秋水', '春风', '夏荷', '冬雪', '灵犀', '瑶琴', '琉璃', '翡翠',
  '素心', '芷若', '含烟', '语嫣', '盈盈', '婉儿', '倾城', '如梦', '似锦', '初雪',
  '落花', '飞燕', '凌波', '含香', '映月', '拂晓', '清影', '幽兰', '暗香', '疏影',
  '玲珑', '璎珞', '明珠', '沉鱼', '落雁', '闭月', '羞花', '天姿', '国色', '无瑕',
];

const GIVEN_NAMES_NEUTRAL = [
  '无名', '天涯', '浮生', '红尘', '江湖', '逍遥', '自在', '空明', '虚怀', '不言',
  '独行', '孤影', '残月', '断弦', '浮云', '流水', '烟波', '霜华', '秋叶', '春泥',
  '清辉', '朗月', '晨曦', '暮色', '晴川', '碧水', '青山', '白鹤', '苍鹰', '惊雷',
];

const TITLES = [
  '铁拳', '飞刀', '独臂', '快剑', '毒蛇', '疯狗', '笑面虎', '鬼见愁', '活阎王',
  '小旋风', '大力', '神行', '铁壁', '铜头', '金刚', '罗汉', '太极', '八卦', '无影',
  '夺命', '追魂', '断魂', '摧心', '碎骨', '穿心', '裂地', '开山', '移山', '填海',
  '血手', '冷面', '银枪', '金刀', '玉面', '白衣', '黑风', '赤焰', '青衫', '紫电',
];

/**
 * 生成随机古风名字
 * @param {'male'|'female'|'random'} gender 性别偏好
 * @returns {string} 完整姓名
 */
export function randomChineseName(gender = 'random') {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  let pool;
  if (gender === 'random') {
    const r = Math.random();
    if (r < 0.45) pool = GIVEN_NAMES_MALE;
    else if (r < 0.75) pool = GIVEN_NAMES_FEMALE;
    else pool = GIVEN_NAMES_NEUTRAL;
  } else if (gender === 'female') {
    pool = Math.random() < 0.8 ? GIVEN_NAMES_FEMALE : GIVEN_NAMES_NEUTRAL;
  } else {
    pool = Math.random() < 0.8 ? GIVEN_NAMES_MALE : GIVEN_NAMES_NEUTRAL;
  }
  const given = pool[Math.floor(Math.random() * pool.length)];
  return surname + given;
}

/**
 * 生成带江湖绰号的名字
 * @returns {{ name: string, title: string, fullName: string }}
 */
export function randomTitledName() {
  const name = randomChineseName('random');
  const title = TITLES[Math.floor(Math.random() * TITLES.length)];
  return { name, title, fullName: `「${title}」${name}` };
}

/**
 * 批量生成不重复的名字
 * @param {number} count 需要的数量
 * @param {boolean} withTitle 是否带绰号
 * @returns {Array}
 */
export function generateUniqueNames(count, withTitle = false) {
  const names = new Set();
  const results = [];
  let attempts = 0;
  while (results.length < count && attempts < count * 10) {
    attempts++;
    if (withTitle) {
      const n = randomTitledName();
      if (!names.has(n.fullName)) {
        names.add(n.fullName);
        results.push(n);
      }
    } else {
      const n = randomChineseName();
      if (!names.has(n)) {
        names.add(n);
        results.push(n);
      }
    }
  }
  return results;
}
