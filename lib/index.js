'use strict'

const ejs = require('ejs'),
  path = require('path'),
  util = fis.util,
  projectPath = path.resolve('.'),
  defaults = require('../config');

class EJSParser {
  constructor(content, file, settings) {
    this.content = content;
    this.file = file;
    // 配置文件读取
    this.options = Object.assign({}, defaults, settings);
    this.options.commonMock = this.getAbsolutePath(this.options.commonMock, this.options.root);

    // 本地变量初始化
    this.ejsFiles = [];
    this.jsFiles = [];
    this.jsBlocks = [];
    this.cssFiles = [];
    this.cssBlocks = [];
    this.mockFiles = [];
    this.framework = '';
  }

  /**
   * 对文件内容进行渲染
   */
  renderTpl() {
    let options = this.options,
      context = {},
      result = this.content;

    if (result === '') {
      return '';
    }

    // 获取include引入的文件
    result = this.compileInclude(result);
    // 获取所有依赖的context
    context = this.getContext();
    // 得到解析后的文件内容
    result = options.parse ? ejs.render(result, context, options) : result;
    // 添加依赖到输入内容
    result = this.addStatics(result);

    // 添加依赖缓存，用于同步更新
    this.addDeps();

    return result;
  }

  /**
   * 读取所有依赖的mock文件，并加入页面依赖缓存，用于同步更新
   * @return
   *  [Object]
   */
  getContext() {
    let context = {},
      options = this.options,
      arrFiles = [];

    // 添加全局mock到context
    if (options.commonMock) {
      arrFiles.push(options.commonMock);
    }

    // 将页面文件同名mock文件加入context
    let pageMock = this.file.realpathNoExt + '.mock';
    if (util.exists(pageMock)) {
      arrFiles.push(pageMock);
    }

    // 将 include 引入的mock文件加入context
    arrFiles = arrFiles.concat(this.mockFiles);

    arrFiles.forEach(_file => {
      if (_file) {
        util.merge(context, require(_file));
        delete require.cache[_file];
      }
    });

    return context;
  }

  // 解析内容中 include 指令引入的文件，收集同名css, js, mock文件
  compileInclude(content) {
    let options = this.options,
      root = options.root,
      delimiter = options.delimiter,
      regParse = new RegExp('<\\' + delimiter + '-\\s*include\\(\\s*(\'|")(.*)\\1([^\\)]+)?\\s*\\);?\\s*\\' + delimiter + '>', 'g');

    content = content.replace(regParse, (match, quote, uri) => {
      let file = this.getAbsolutePath(uri, root);

      if (!file) {
        throw new Error('can not load:' + uri + ' [' + this.file.subpath + ']');
      }

      let result = util.read(file);

      this.ejsFiles.push(file);

      // 收集css文件
      [
        this.replaceExt(uri, '.css'),
        this.replaceExt(uri, '.scss'),
        this.replaceExt(uri, '.less'),
        this.replaceExt(uri, '.sass')
      ].forEach(css => {
        let absPath = this.getAbsolutePath(css, root);
        if (!absPath) return;
        // 处理模板引擎的 root 不是项目根目录的情况
        absPath = absPath.replace(projectPath, '');
        if (this.cssFiles.indexOf(absPath) === -1) {
          this.cssFiles.push(absPath);
        }
      });
      // 收集js文件
      let _jsFile = this.getAbsolutePath(this.replaceExt(uri, '.js'), root);
      if (_jsFile) {
        // 处理模板引擎的 root 不是项目根目录的情况
        _jsFile = _jsFile.replace(projectPath, '');
        if (this.jsFiles.indexOf(_jsFile) === -1) {
          this.jsFiles.push(_jsFile);
        }
      }
      // 收集mock文件
      let _mockFile = this.getAbsolutePath(this.replaceExt(uri, '.mock'), root);
      if (_mockFile && this.mockFiles.indexOf(_mockFile) === -1) {
        this.mockFiles.push(_mockFile);
      }
      // 继续解析 include 指令
      result = this.compileInclude(result);
      // 开启模板解析时，返回文件内容，否则保持原样
      if (options.parse) {
        return result;
      } else {
        return match;
      }
    });
    return content;
  }

  /** 替换文件的扩展名
   * @example
   * replaceExt('/widget/a/a.html', '.css') => '/widget/a/a.css'
   */
  replaceExt(pathname, ext) {
    return pathname.substring(0, pathname.lastIndexOf('.')) + ext;
  }

  /**
   * 返回文件绝对路径，因为root为数组，所以每个root都得判断一下
   * @param file {String} 文件相对路径
   * @param root {Array} root目录数组
   * @return {String} 返回文件绝对路径或者null
   */
  getAbsolutePath(file, root) {
    let result = null,
      fileName = '';
    if(!file || !root) {
        return result;
    }

    fileName = path.join(root, file);

    if(util.exists(fileName)) {
        result = fileName;
    }

    return result;
  }

  /**
   * 添加静态资源依赖
   */
  addStatics(content) {
    let options = this.options,
      loader = options.loader || null, // 模块化加载函数名称[requirejs|modjs|seajs]
      loadSync = options.loadSync,
      strCss = '',
      strFrameWork = '',
      strJs = '',
      rCssHolder = /<!--\s?WIDGET_CSS_HOLDER\s?-->/,
      rFrameWorkHolder = /<!--\s?WIDGET_FRAMEWORK_HOLDER\s?-->/,
      rJsHolder = /<!--\s?WIDGET_JS_HOLDER\s?-->/;

    // 拼接css文件引入
    this.cssFiles.forEach(_uri => {
      strCss += '<link rel="stylesheet" href="' + _uri + '">\n';
    });
    // 拼接内嵌css代码块
    if (this.cssBlocks.length > 0) {
      strCss += '<style>\n';
      this.cssBlocks.forEach(block => {
        strCss += block;
      });
      strCss += '</style>\n';
    }
    if (rCssHolder.test(content)) {
      content = content.replace(rCssHolder, strCss);
    } else {
      // css放在</head>标签之前
      content = content.replace(/(<\/head>)/i, strCss + '$1');
    }

    // js modules框架引入
    if (this.framework !== '') {
      strFrameWork = '<script data-loader src="' + this.framework + '"></script>\n';
      if (rFrameWorkHolder.test(content)) {
        content = content.replace(rFrameWorkHolder, strFrameWork);
      } else {
        // js放在</body>标签之前
        content = content.replace(/(<\/body>)/i, strFrameWork + '$1');
      }
    }

    if (this.jsFiles.length > 0) {
      // 非模块化直接拼接script标签
      this.jsFiles.forEach(_uri => {
        strJs += '<script src="' + _uri + '"></script>\n';
      });
      // 模块化加载
      if (loader) {
        // 如果未开启同步加载，先清空strJs
        if (!loadSync) {
          strJs = '';
        }
        switch (loader) {
          case 'require':
          case 'requirejs':
          case 'modjs':
            strJs += '<script>require(["' + this.jsFiles.join('","') + '"]);</script>\n';
            break;
          case 'seajs.use':
          case 'seajs':
            strJs += '<script>seajs.use(["' + this.jsFiles.join('","') + '"]);</script>\n';
            break;
        }
      }
    }
    // 拼接内嵌js代码块
    if (this.jsBlocks.length > 0) {
      strJs += '<script type="text/javascript">\n';
      this.jsBlocks.forEach(block => {
        strJs += block;
      });
      strJs += '</script>\n';
    }
    if (rJsHolder.test(content)) {
      content = content.replace(rJsHolder, strJs);
    } else {
      // js放在</body>标签之前
      content = content.replace(/(<\/body>)/i, strJs + '$1');
    }

    return content;
  }

  /*
   * 将所有引入的vm和mock文件加入依赖缓存，用于文件修改时，自动编译
   */
  addDeps() {
    let options = this.options,
      file = this.file,
      arr = [];

    // 添加全局mock到context
    if (options.commonMock) {
      arr.push(options.commonMock);
    }

    // 将页面文件同名mock文件加入context
    let pageMock = this.file.realpathNoExt + '.mock';
    if (util.exists(pageMock)) {
      arr.push(pageMock);
    }

    arr = arr.concat(this.ejsFiles);
    arr = arr.concat(this.mockFiles);

    arr.forEach(_uri => {
      _uri && file.cache.addDeps(_uri);
    });
  }
}

module.exports = function (content, file, settings) {
  return new EJSParser(content, file, settings);
};

