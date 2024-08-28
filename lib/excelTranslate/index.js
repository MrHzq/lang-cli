const log = require("../../utils/log");
const Spinner = require("../../utils/spinner");
const runStep = require("../../utils/runStep");
const { prompt, numberRule } = require("../../utils/inquirer");
const path = require("path");
const { checkFileExist, removeDir, readdirSync } = require("../../utils/fs");

const ExcelJS = require("exceljs");
const baidu = require("../../plugins/baidu");

let mainSpinner;

let originFile, newFile;

let worksheetName;
let headers = [];
let rows = [];
let headerRowJson = [];

const langMap = {
  "zh-CN": "zh",
  "zh-HK": "cht",
};

// 初始化变量
const initVar = (answers) => {
  originFile = answers.originFile;

  newFile = originFile.split(".");
  newFile[0] += "(已翻译)";
  newFile = newFile.join(".");
};

const readExcelFile = async (filePath) => {
  try {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(1); // 获取第一个工作表

    worksheetName = worksheet.name;

    // 遍历表头
    headers = worksheet.getRow(1).values;

    // 遍历数据行
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        // 跳过表头行
        const rowData = row.values;
        if (rowData[1]) {
          rows.push(rowData);
          const rowObj = {};
          headers.forEach((h, index) => (rowObj[h] = rowData[index]));
          headerRowJson.push(rowObj);
        }
      }
    });
  } catch (err) {
    console.error(`读取 Excel 文件时发生错误: ${err}`);
  }
};

const writeExcelFile = async (filePath, list) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(worksheetName);

  // 添加表头
  worksheet.addRow(headers);
  // 添加数据行
  worksheet.addRows(list);

  if (checkFileExist(filePath)) removeDir(filePath);

  await workbook.xlsx.writeFile(filePath);
};

// 读取表内容
const getExcel = async () => {
  if (checkFileExist(originFile)) await readExcelFile(originFile);
  else return `Excel: ${originFile} 不存在`;
};

// 对表内容逐个翻译
const toTranslate = async () => {
  mainSpinner.do("stop");
  const len = headerRowJson.length;
  for (let i = 0; i < len; i++) {
    const item = headerRowJson[i];

    const existValueKey = "zh-CN";
    const value = item[existValueKey];

    const from = langMap[existValueKey];

    const toTra = Object.entries(item).filter(([, val]) => val === undefined);

    const toTraLen = toTra.length;
    for (let j = 0; j < toTraLen; j++) {
      const [key] = toTra[j];
      const { trans_result, error_msg } = await baidu({
        query: value,
        from,
        to: langMap[key] || key,
      });

      if (trans_result) {
        const { dst } = trans_result;
        item[key] = dst;
        log.succeed(`    翻译进度：${i + 1}-${j + 1}/${len}-${toTraLen}`);
      } else {
        log.error(error_msg);
        break;
      }
    }
  }
};

// 创建新表
const createExcel = async () => {
  await writeExcelFile(
    newFile,
    headerRowJson.map((row) => {
      return Object.entries(row).reduce((_, val) => {
        _.push(val[1]);
        return _;
      }, []);
    })
  );

  return { success: true, tip: `已生成 ${newFile}` };
};

// 主流程 - step 集合
const mainStepList = [
  {
    fun: getExcel,
    desc: () => "获取 Excel 内容",
  },
  {
    fun: toTranslate,
    desc: () => "翻译 Excel 内容",
    ignore: false,
  },
  {
    fun: createExcel,
    desc: () => "创建 Excel 内容",
  },
];

// todo 流程 - step 集合
const todoStepList = [
  {
    desc: () => `打开 ${newFile}，进行人工检查`,
  },
];

const isExcelFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".xls" || ext === ".xlsx";
};

const getExcelFile = () => {
  return readdirSync()
    .filter((file) => isExcelFile(file))
    .map((file, index) => {
      return {
        name: `${index + 1}、${file}`,
        value: file,
      };
    });
};

module.exports = async (_, options) => {
  const { _description, parent } = options;
  const choices = getExcelFile();

  const answers = await prompt(
    choices.length
      ? [
          {
            type: "list",
            name: "originFile",
            message: "请选择要处理的 Excel",
            choices,
          },
        ]
      : [
          {
            type: "input",
            name: "originFile",
            message: "请输入要处理的 Excel 完整路径:",
            validate: numberRule,
          },
        ]
  );

  initVar(answers);

  mainSpinner = new Spinner(_description);

  mainSpinner.start();

  const runSuccess = await runStep(mainStepList);

  if (runSuccess) {
    mainSpinner.succeed();

    log.newLine();

    log.warn("next todo");
    runStep(todoStepList, "warn", { prefix: "todo" });
  } else {
    mainSpinner.fail();
  }
};
