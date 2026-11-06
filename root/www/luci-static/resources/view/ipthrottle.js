'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';

return view.extend({
    load: function() {
        var versionUrl = '/luci-static/resources/view/ipthrottle.version?t=' + Date.now();
        var storageKey = 'ipthrottle_version';

        var statusPromise = fs.exec('/usr/sbin/ipthrottle', ['status'])
            .then(function(res) { return res.stdout || ''; })
            .catch(function() { return ''; });

        return fetch(versionUrl)
            .then(function(res) { return res.text(); })
            .then(function(serverVersion) {
                serverVersion = serverVersion.trim();
                var localVersion = localStorage.getItem(storageKey);

                if (localVersion && localVersion !== serverVersion) {
                    localStorage.setItem(storageKey, serverVersion);

                    if (window.L && window.L.classes) {
                        delete window.L.classes['view.ipthrottle'];
                    }
                    if (window.require && window.require.s) {
                        var moduleKey = 'view/ipthrottle';
                        delete window.require.s.contexts._._defined[moduleKey];
                        delete window.require.s.contexts._._loaded[moduleKey];
                    }

                    var url = window.location.pathname;
                    url = url.replace(/[?&]_v=[^&]+/, '');
                    url += '?_v=' + serverVersion;
                    window.location.href = url;

                    return new Promise(function() {});
                }

                localStorage.setItem(storageKey, serverVersion);

                return Promise.all([
                    uci.load('ipthrottle'),
                    statusPromise
                ]).then(function(results) {
                    return { status: results[1] };
                });
            })
            .catch(function() {
                return uci.load('ipthrottle').then(function() {
                    return { status: '' };
                });
            });
    },

    render: function(data) {
        var m, s, o;
        var statusText = (data && data.status) ? data.status : '';

        var style = document.createElement('style');
        style.textContent = '::placeholder { color: #999 !important; opacity: 1 !important; }' +
            '.ipthrottle-status-bar { padding: 10px 15px; margin-bottom: 15px; border-radius: 5px; font-weight: bold; font-size: 14px; }' +
            '.ipthrottle-status-running { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }' +
            '.ipthrottle-status-stopped { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }' +
            '.ipthrottle-status-idle { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }';
        document.head.appendChild(style);

        m = new form.Map('ipthrottle', _('限速管控 - IP限速'),
            _('按IP限制上传/下载带宽，支持独立/共享限速、IP范围、协议过滤和时间计划'));

        // ==========================================
        // 运行状态横幅（智能判断版）
        // ==========================================
        var statusSection = m.section(form.NamedSection, '__status__', '');
        statusSection.render = function() {
            var div = E('div', { 'class': 'ipthrottle-status-bar' });
            
            // 兼容 running 和 stopped，只要底层有返回，就说明服务是活着的
            if (statusText && (statusText.indexOf('running') !== -1 || statusText.indexOf('stopped') !== -1)) {
                var ruleMatch = statusText.match(/Active IP throttle rules:\s*(\d+)/);
                var ruleCount = ruleMatch ? ruleMatch[1] : '0';
                
                if (ruleCount > 0) {
                    div.className += ' ipthrottle-status-running';
                    div.appendChild(E('span', {}, '✅ 限速管控 ' + _('运行中') + ' — ' + _('活跃规则') + ': ' + ruleCount));
                } else {
                    div.className += ' ipthrottle-status-idle';
                    div.appendChild(E('span', {}, 'ℹ️ 限速管控 ' + _('已就绪') + ' — ' + _('当前无生效规则或未到计划时间')));
                }
            } else {
                div.className += ' ipthrottle-status-stopped';
                div.appendChild(E('span', {}, '❌ 限速管控 ' + _('未运行') + ' — ' + _('请检查 ACL 权限或系统日志')));
            }
            return div;
        };

        // ==========================================
        // 规则列表（GridSection）
        // ==========================================
        s = m.section(form.GridSection, 'rule', _('规则列表'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable  = true;

        o = s.option(form.Flag, 'enabled', _('启用'));
        o.rmempty = false;
        o.default = '1';

        o = s.option(form.Value, 'priority', _('优先级'));
        o.rmempty = false;
        o.datatype = 'uinteger';
        o.placeholder = '10';
        o.default = '10';

        o = s.option(form.Value, 'name', _('规则名称'));
        o.rmempty = false;
        o.placeholder = '例：客厅电视';

        o = s.option(form.DynamicList, 'ip_entry', _('内网IP'));
        o.rmempty = false;
        o.placeholder = '192.168.1.100 或 192.168.1.100-200';

        o = s.option(form.Value, 'upload_kbps', _('上传<br/><small style="color:#999">Kbps</small>'));
        o.rmempty = false;
        o.datatype = 'uinteger';
        o.placeholder = '1024';
        o.default = '1024';

        o = s.option(form.Value, 'download_kbps', _('下载<br/><small style="color:#999">Kbps</small>'));
        o.rmempty = false;
        o.datatype = 'uinteger';
        o.placeholder = '4096';
        o.default = '4096';

        o = s.option(form.ListValue, 'schedule_type', _('生效时间'));
        o.value('always', _('全天'));
        o.value('weekly', _('自定义'));
        o.default = 'always';
        o.rmempty = false;

        o = s.option(form.ListValue, 'proto', _('协议'));
        o.value('any', _('全部协议'));
        o.value('tcp', _('TCP'));
        o.value('udp', _('UDP'));
        o.value('tcp+udp', _('TCP+UDP'));
        o.default = 'any';
        o.rmempty = false;
        o.modalonly = true;

        o = s.option(form.ListValue, 'mode', _('限速模式'));
        o.value('independent', _('独立限速(每个IP独立)'));
        o.value('shared', _('共享限速(所有IP共享)'));
        o.default = 'independent';
        o.rmempty = false;
        o.modalonly = true;

        o = s.option(form.Flag, 'schedule_day_mon', _('周一'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.default = '0';
        o.modalonly = true;

        o = s.option(form.Flag, 'schedule_day_tue', _('周二'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.default = '0';
        o.modalonly = true;

        o = s.option(form.Flag, 'schedule_day_wed', _('周三'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.default = '0';
        o.modalonly = true;

        o = s.option(form.Flag, 'schedule_day_thu', _('周四'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.default = '0';
        o.modalonly = true;

        o = s.option(form.Flag, 'schedule_day_fri', _('周五'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.default = '0';
        o.modalonly = true;

        o = s.option(form.Flag, 'schedule_day_sat', _('周六'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.default = '0';
        o.modalonly = true;

        o = s.option(form.Flag, 'schedule_day_sun', _('周日'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.default = '0';
        o.modalonly = true;

        o = s.option(form.Value, 'schedule_start', _('开始时间'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.placeholder = '08:00';
        o.modalonly = true;
        o.description = _('格式 HH:MM，不填默认 00:00');

        o = s.option(form.Value, 'schedule_end', _('结束时间'));
        o.depends('schedule_type', 'weekly');
        o.rmempty = true;
        o.placeholder = '22:00';
        o.modalonly = true;
        o.description = _('格式 HH:MM，不填默认 23:59');

        return m.render();
    }
});
