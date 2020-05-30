/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

module.exports = function (grunt) {
  var DIST_DIR = "dist";

  var pkg = grunt.file.readJSON("package.json");

  var bower = {
    TOKEN: process.env.TOKEN,
    repository: "git://github.com/Kurento/<%= pkg.name %>-bower.git"
  };

  // Project configuration.
  grunt.initConfig({
    pkg: pkg,
    bower: bower,

    // Plugins configuration
    clean: {
      generated_code: DIST_DIR,
      coverage: "lib-cov",
    },

    githooks: {
      all: {
        "pre-commit": "jsbeautifier:git-pre-commit"
      }
    },

    jshint: {
      all: ["lib/**/*.js", "test/*.js"],
      options: {
        curly: true,
        indent: 2,
        unused: true,
        undef: true,
        camelcase: false,
        newcap: true,
        node: true,
        browser: true
      }
    },

    jsbeautifier: {
      options: {
        js: {
          braceStyle: "collapse",
          breakChainedMethods: false,
          e4x: false,
          evalCode: false,
          indentChar: " ",
          indentLevel: 0,
          indentSize: 2,
          indentWithTabs: false,
          jslintHappy: true,
          keepArrayIndentation: false,
          keepFunctionIndentation: false,
          maxPreserveNewlines: 2,
          preserveNewlines: true,
          spaceBeforeConditional: true,
          spaceInParen: false,
          unescapeStrings: false,
          wrapLineLength: 80
        }
      },
      default: {
        src: ["lib/**/*.js", "*.js", "test/*.js", "scripts/*.js"]
      },
      "git-pre-commit": {
        src: ["lib/**/*.js", "*.js", "test/*.js", "scripts/*.js"],
        options: {
          mode: "VERIFY_ONLY"
        }
      }
    },

    // Generate instrumented version for coverage analisis
    jscoverage: {
      all: {
        expand: true,
        cwd: 'lib/',
        src: ['**/*.js'],
        dest: 'lib-cov/'
      }
    },
  });

  // Load plugins
  grunt.loadNpmTasks("grunt-contrib-clean");
  grunt.loadNpmTasks("grunt-githooks");
  grunt.loadNpmTasks("grunt-jsbeautifier");
  grunt.loadNpmTasks("grunt-jscoverage");
  grunt.loadNpmTasks("grunt-contrib-jshint");

  // Alias tasks
  grunt.registerTask("default", [
    "clean",
    "jsbeautifier:git-pre-commit"
  ]);
  grunt.registerTask("coverage", [
    "clean:coverage",
    "jscoverage",
  ]);
};
