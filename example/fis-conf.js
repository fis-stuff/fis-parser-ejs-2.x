'use strict'

const root = fis.project.getProjectPath();
const util = fis.util;
let packed = false;
let ejsConf = {
    loader: 'requirejs',// null,requirejs,modjs,seajs
    loadSync: false,
    commonMock: '/page/commonMock.mock',
    root: root
};

// 模块化勾子
if(ejsConf.loader) {
    if(ejsConf.loader !== 'seajs') {
        fis.hook('amd');
    } else {
        fis.hook('cmd');
    }
}

// 打包配置
fis.match('::package', {
    postpackager: fis.plugin('loader', {
        //resourceType: 'amd',
        useInlineMap: true,
        //allInOne: true
    })
});

// 使用fis-parser-ejs-2.x直接编译html文件
fis
    .match('*.ejs', {
        parser: (content, file) => {
            return require('../')(content, file, ejsConf);
        },
        rExt: '.html',
        loaderLang: 'html'
    })
    .match('/widget/**.{ejs,mock}', {
        release: false
    })
    .match('/page/**.mock', {
        release: false
    })
    // 加添scss编译
    .match('*.scss', {
        rExt: '.css',
        parser: fis.plugin('node-sass')
    })

// 合并配置
if(packed) {
    fis
        .match('/widget/**.{scss,css}', {
            packTo: '/widget/widget_pkg.css'
        })
        .match('/widget/**.js', {
            // 只有选择了模块化框架后才执行模块化
            isMod: ejsConf.loader ? true : false,
            packTo: '/widget/widget_pkg.js'
        })
        .match('/widget/config.js', {
            isMod: false
        })
}

// 只发布模板文件
let tmpConf = util.merge({parse: false}, ejsConf);
fis
    .media('tpl')
    .match('*.ejs', {
        parser: (content, file) => {
            return require('../')(content, file, tmpConf);
        },
        rExt: '.ejs',
        deploy: fis.plugin('local-deliver', {
            to: './output/template'
        })
    })
    .match('/page/(**.ejs)', {
        release: '$1'
    })
    .match('/widget/**.ejs', {
        release: '$0'
    })
