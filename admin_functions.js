// ============================================================
// ADMIN FUNCTIONS - Login Google + Pendaftaran + Rekod Bayaran
// ============================================================

// Global state for admin
let _currentUserRole = null; // superadmin, admin, waris, jurulatih
let _currentUserDoc = null;
let _rejectingPendaftaranId = null;
let _rejectingPaymentId = null;
let _viewingPaymentId = null;
let _adminPayView = 'list'; // 'list' or 'member'


// ===== GOOGLE LOGIN WITH ROLE CHECK =====
async function handleGoogleLogin() {
    const loginError = document.getElementById('loginError');
    const loginLoading = document.getElementById('loginLoading');
    const googleBtn = document.getElementById('googleLoginBtn');

    loginError.classList.add('hidden');
    loginLoading.classList.remove('hidden');
    if (googleBtn) googleBtn.classList.add('hidden');

    try {
        if (!_firebaseAuth) throw new Error("Auth belum siap.");
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await _firebaseAuth.signInWithPopup(provider);
        const user = result.user;

        // Check role in Firestore 'users' collection
        const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();

        if (!userDoc.exists) {
            // User not registered
            await _firebaseAuth.signOut();
            loginLoading.classList.add('hidden');
            if (googleBtn) googleBtn.classList.remove('hidden');
            document.getElementById('loginErrorMsg').textContent =
                'Akaun anda belum didaftarkan. Sila hubungi admin untuk pengesahan.';
            loginError.classList.remove('hidden');
            loginError.classList.add('flex');
            return;
        }

        const userData = userDoc.data();
        const role = userData.role || 'waris';
        _currentUserRole = role;
        _currentUserDoc = userData;

        loginLoading.classList.add('hidden');
        closeLoginModal();

        // Show loading overlay
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');

        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            redirectByRole(role, userData);
        }, 1800);

    } catch (e) {
        loginLoading.classList.add('hidden');
        if (googleBtn) googleBtn.classList.remove('hidden');
        if (e.code !== 'auth/popup-closed-by-user') {
            document.getElementById('loginErrorMsg').textContent =
                'Log masuk gagal: ' + (e.message || e.code);
            loginError.classList.remove('hidden');
            loginError.classList.add('flex');
        }
    }
}


// ===== REDIRECT BY ROLE =====
function redirectByRole(role, userData) {
    const roleTag = document.getElementById('roleTag');
    const roleNameDisplay = document.getElementById('roleNameDisplay');
    const roleDot = document.getElementById('roleDot');

    const roleLabels = {
        superadmin: 'PENTADBIR UTAMA',
        admin: 'PENTADBIR',
        waris: 'WARIS',
        jurulatih: 'JURULATIH'
    };

    if (role === 'superadmin' || role === 'admin') {
        // Set as admin user
        currentUser = {
            admin_name: userData.nama || firebaseUser.displayName || firebaseUser.email.split('@')[0],
            admin_phone: userData.telefon || '',
            is_admin: true,
            uid: firebaseUser.uid,
            role: role
        };
        roleTag.textContent = roleLabels[role] || 'PENTADBIR';
        roleNameDisplay.textContent = currentUser.admin_name;
        roleDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0';

        updateAccessMode();
        showDashboard();
        showToast(`Selamat datang, ${currentUser.admin_name}! Peranan: ${roleLabels[role]}`, 'success');

    } else if (role === 'waris') {
        currentUser = null;
        roleTag.textContent = roleLabels.waris;
        roleNameDisplay.textContent = userData.nama || firebaseUser.displayName || 'Waris';
        roleDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0';

        updateAccessMode();
        showDashboard();
        switchTab('profile');
        showToast(`Selamat datang, ${userData.nama || 'Waris'}!`, 'success');

    } else if (role === 'jurulatih') {
        currentUser = null;
        showToast('Dashboard Jurulatih belum tersedia. Sila hubungi admin.', 'warning');
        showDashboard();
        updateAccessMode();

    } else {
        showToast('Peranan tidak dikenali. Sila hubungi admin.', 'error');
    }
}


// ===== ADMIN PENDAFTARAN - RENDER =====
function renderAdminPendaftaran() {
    const container = document.getElementById('adminPendaftaranList');
    if (!container) return;

    const filter = document.getElementById('adminPendaftaranFilter')?.value || 'pending';

    // Each member record is a pendaftaran
    // Status stored in registration_status field (pending/approved/rejected)
    const pendaftaranList = allMembers.map(m => {
        return {
            ...m,
            status: m.registration_status || 'pending'
        };
    });

    // Update stats
    const pending = pendaftaranList.filter(p => p.status === 'pending').length;
    const approved = pendaftaranList.filter(p => p.status === 'approved').length;
    const rejected = pendaftaranList.filter(p => p.status === 'rejected').length;

    const elP = document.getElementById('statPendaftaranPending');
    const elA = document.getElementById('statPendaftaranApproved');
    const elR = document.getElementById('statPendaftaranRejected');
    if (elP) elP.textContent = pending;
    if (elA) elA.textContent = approved;
    if (elR) elR.textContent = rejected;

    // Filter
    let filtered = pendaftaranList;
    if (filter !== 'all') {
        filtered = pendaftaranList.filter(p => p.status === filter);
    }

    // Sort: pending first
    filtered.sort((a, b) => {
        const order = { pending: 0, approved: 1, rejected: 2 };
        return (order[a.status] || 9) - (order[b.status] || 9);
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-neutral-950/20 border border-neutral-800 rounded-2xl">
                <p class="text-xs text-neutral-500 font-semibold">Tiada rekod pendaftaran untuk paparan ini.</p>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(m => {
        let children = [];
        try { children = JSON.parse(m.children || '[]'); } catch(e) {}

        const statusBadge = {
            pending: 'bg-gold-500/10 text-gold-400 border-gold-500/20',
            approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            rejected: 'bg-red-500/10 text-red-400 border-red-500/20'
        };
        const statusText = {
            pending: '⏳ Menunggu Semakan',
            approved: '✅ Diluluskan',
            rejected: '❌ Ditolak'
        };

        const childrenInfo = children.map(c =>
            `<span class="inline-block px-2 py-0.5 bg-neutral-800 rounded text-[9px] text-neutral-300 mr-1 mb-1">${c.name} (${c.age} Thn${c.jantina ? ', ' + (c.jantina === 'lelaki' ? '♂' : '♀') : ''}${c.tahap ? ', ' + c.tahap : ''})</span>`
        ).join('');

        const actionBtns = m.status === 'pending' ? `
            <div class="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-800">
                <button onclick="viewDetailPendaftaran('${m.__backendId}')" class="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-[10px] font-bold rounded-lg transition-premium">Lihat Detail</button>
                <button onclick="approvePendaftaran('${m.__backendId}')" class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black rounded-lg transition-premium">Luluskan</button>
                <button onclick="openRejectPendaftaran('${m.__backendId}')" class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold rounded-lg transition-premium">Tolak</button>
            </div>` : `
            <div class="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-800">
                <button onclick="viewDetailPendaftaran('${m.__backendId}')" class="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-[10px] font-bold rounded-lg transition-premium">Lihat Detail</button>
            </div>`;

        const receiptThumb = m.receipt_image ? `
            <button onclick="window.open('${m.receipt_image}','_blank')" class="text-[9px] text-gold-500 font-bold flex items-center gap-1 mt-1 hover:underline">
                <i data-lucide="file-image" class="w-3 h-3"></i> Lihat Resit
            </button>` : '';

        return `
            <div class="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 space-y-3">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h3 class="text-sm font-black text-white uppercase">${m.guardian_name}</h3>
                        <p class="text-[10px] text-neutral-400 mt-0.5">📞 ${m.guardian_phone} ${m.guardian_email ? '· ✉ ' + m.guardian_email : ''}</p>
                        <p class="text-[9px] text-neutral-500 mt-1">📅 Didaftar: ${m.createdAt ? formatDateDisplay(m.createdAt.split('T')[0]) : '-'}</p>
                    </div>
                    <span class="text-[9px] px-2.5 py-1 rounded-lg border font-bold shrink-0 ${statusBadge[m.status]}">${statusText[m.status]}</span>
                </div>
                <div>
                    <p class="text-[9px] text-neutral-500 font-bold uppercase tracking-wider mb-1">Ahli (${children.length}):</p>
                    <div class="flex flex-wrap">${childrenInfo}</div>
                </div>
                ${receiptThumb}
                ${m.catatan_admin ? `<p class="text-[9px] text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">📝 Catatan Admin: ${m.catatan_admin}</p>` : ''}
                ${actionBtns}
            </div>`;
    }).join('');

    lucide.createIcons();
}


// ===== APPROVE PENDAFTARAN =====
async function approvePendaftaran(id) {
    const m = allMembers.find(x => x.__backendId === id);
    if (!m) return;

    showConfirm('Luluskan Pendaftaran', `Luluskan pendaftaran ${m.guardian_name}?`, async () => {
        m.registration_status = 'approved';
        m.status_ahli = 'Aktif';
        m.approvedBy = firebaseUser?.uid || '';
        m.approvedAt = new Date().toISOString();
        m.updatedAt = new Date().toISOString();

        const res = await dataSdk.update(m);
        if (res.isOk) {
            showToast('Pendaftaran telah diluluskan.', 'success');
            renderAdminPendaftaran();
        } else {
            showToast('Gagal meluluskan pendaftaran.', 'error');
        }
    });
}

// ===== REJECT PENDAFTARAN =====
function openRejectPendaftaran(id) {
    const m = allMembers.find(x => x.__backendId === id);
    if (!m) return;
    _rejectingPendaftaranId = id;
    document.getElementById('rejectPendaftaranNote').value = '';

    // Build info text
    let children = [];
    try { children = JSON.parse(m.children || '[]'); } catch(e) {}
    const infoEl = document.getElementById('rejectPendaftaranInfo');
    if (infoEl) {
        infoEl.innerHTML = `<strong>${m.guardian_name}</strong> — ${children.length} ahli`;
    }

    const modal = document.getElementById('rejectPendaftaranModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    lucide.createIcons();
}

function closeRejectPendaftaranModal() {
    const modal = document.getElementById('rejectPendaftaranModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    _rejectingPendaftaranId = null;
}

async function confirmRejectPendaftaran() {
    if (!_rejectingPendaftaranId) return;
    const note = document.getElementById('rejectPendaftaranNote')?.value.trim();
    if (!note) {
        showToast('Catatan admin wajib diisi untuk penolakan.', 'error');
        return;
    }

    const m = allMembers.find(x => x.__backendId === _rejectingPendaftaranId);
    if (!m) return;

    m.registration_status = 'rejected';
    m.status_ahli = 'Ditolak';
    m.rejectedBy = firebaseUser?.uid || '';
    m.rejectedAt = new Date().toISOString();
    m.catatan_admin = note;
    m.updatedAt = new Date().toISOString();

    const res = await dataSdk.update(m);
    if (res.isOk) {
        showToast('Pendaftaran telah ditolak.', 'success');
        closeRejectPendaftaranModal();
        renderAdminPendaftaran();
    } else {
        showToast('Gagal menolak pendaftaran.', 'error');
    }
}


// ===== VIEW DETAIL PENDAFTARAN =====
function viewDetailPendaftaran(id) {
    const m = allMembers.find(x => x.__backendId === id);
    if (!m) return;

    let children = [];
    try { children = JSON.parse(m.children || '[]'); } catch(e) {}

    const statusBadge = {
        pending: '<span class="px-2 py-0.5 bg-gold-500/10 text-gold-400 border border-gold-500/20 rounded-lg text-[9px] font-bold">⏳ Menunggu Semakan</span>',
        approved: '<span class="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[9px] font-bold">✅ Diluluskan</span>',
        rejected: '<span class="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[9px] font-bold">❌ Ditolak</span>'
    };

    const status = m.registration_status || 'pending';

    const childrenHtml = children.map((c, i) => `
        <div class="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-1">
            <p class="text-xs font-bold text-white">${c.name}</p>
            <div class="grid grid-cols-2 gap-1 text-[10px] text-neutral-400">
                <span>Umur: ${c.age} Thn</span>
                <span>Jantina: ${c.jantina === 'lelaki' ? '♂ Lelaki' : '♀ Perempuan'}</span>
                ${c.sekolah ? `<span class="col-span-2">Sekolah: ${c.sekolah}</span>` : ''}
                ${c.tahap ? `<span>Tahap: ${c.tahap}</span>` : ''}
            </div>
        </div>
    `).join('');

    const content = document.getElementById('detailPendaftaranContent');
    content.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <p class="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Status Pendaftaran</p>
                ${statusBadge[status]}
            </div>
            <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-2">
                <p class="text-[9px] font-bold text-gold-500 uppercase tracking-wider">Maklumat Waris</p>
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <div><span class="text-neutral-500 text-[9px]">Nama</span><br><span class="font-bold text-white">${m.guardian_name}</span></div>
                    <div><span class="text-neutral-500 text-[9px]">Telefon</span><br><span class="font-bold text-white">${m.guardian_phone}</span></div>
                    <div class="col-span-2"><span class="text-neutral-500 text-[9px]">Emel</span><br><span class="font-bold text-white">${m.guardian_email || '-'}</span></div>
                </div>
            </div>
            <div class="space-y-2">
                <p class="text-[9px] font-bold text-gold-500 uppercase tracking-wider">Senarai Ahli (${children.length})</p>
                ${childrenHtml}
            </div>
            <div class="grid grid-cols-2 gap-2 text-[10px]">
                <div><span class="text-neutral-500">Tarikh Daftar</span><br><span class="text-neutral-200">${m.createdAt ? formatDateDisplay(m.createdAt.split('T')[0]) : '-'}</span></div>
                ${m.approvedAt ? `<div><span class="text-neutral-500">Tarikh Lulus</span><br><span class="text-emerald-400">${formatDateDisplay(m.approvedAt.split('T')[0])}</span></div>` : ''}
                ${m.rejectedAt ? `<div><span class="text-neutral-500">Tarikh Tolak</span><br><span class="text-red-400">${formatDateDisplay(m.rejectedAt.split('T')[0])}</span></div>` : ''}
            </div>
            ${m.receipt_image ? `
                <div>
                    <p class="text-[9px] font-bold text-gold-500 uppercase tracking-wider mb-2">Resit Bayaran Pendaftaran</p>
                    <img src="${m.receipt_image}" class="max-h-48 object-contain rounded-xl border border-neutral-800 w-full bg-neutral-900">
                </div>` : ''}
            ${m.catatan_admin ? `
                <div class="bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                    <p class="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-1">Catatan Admin</p>
                    <p class="text-xs text-neutral-300">${m.catatan_admin}</p>
                </div>` : ''}
        </div>
    `;

    const modal = document.getElementById('detailPendaftaranModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    lucide.createIcons();
}

function closeDetailPendaftaranModal() {
    const modal = document.getElementById('detailPendaftaranModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}


// ===== ADMIN REKOD BAYARAN - RENDER =====
function renderAdminPayments() {
    const month = document.getElementById('paymentMonth')?.value || '';
    const search = (document.getElementById('searchPayment')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('filterPayStatus')?.value || 'all';
    const typeFilter = document.getElementById('filterPayType')?.value || 'all';

    // Build all children with payment info
    const allChildren = [];
    allMembers.forEach(member => {
        let children = [];
        try { children = JSON.parse(member.children || '[]'); } catch(e) {}
        children.forEach(child => {
            allChildren.push({
                id: member.__backendId + '_' + child.name,
                memberId: member.__backendId,
                name: child.name,
                age: child.age,
                guardianName: member.guardian_name,
                guardianPhone: member.guardian_phone,
                guardianEmail: member.guardian_email || ''
            });
        });
    });

    // Get payments for current month
    const monthPayments = month ? allPayments.filter(p => p.month === month) : allPayments;

    // Build payment records list
    let records = [];
    if (month) {
        allChildren.forEach(child => {
            const pay = monthPayments.find(p => p.child_id === child.id);
            records.push({ ...child, payment: pay || null });
        });
    } else {
        // Show all payments
        monthPayments.forEach(pay => {
            const child = allChildren.find(c => c.id === pay.child_id);
            if (child) {
                records.push({ ...child, payment: pay });
            }
        });
    }

    // Apply filters
    if (search) {
        records = records.filter(r =>
            r.name.toLowerCase().includes(search) ||
            r.guardianName.toLowerCase().includes(search)
        );
    }
    if (statusFilter !== 'all') {
        if (statusFilter === 'unpaid') {
            records = records.filter(r => !r.payment);
        } else if (statusFilter === 'paid') {
            records = records.filter(r => r.payment?.payment_status === 'paid');
        } else if (statusFilter === 'pending') {
            records = records.filter(r => r.payment?.payment_status === 'pending');
        } else if (statusFilter === 'rejected') {
            records = records.filter(r => r.payment?.payment_status === 'rejected');
        }
    }
    if (typeFilter !== 'all') {
        if (typeFilter === 'other') {
            records = records.filter(r => r.payment && !['monthly_ihsan','monthly','annual','ihsan'].includes(r.payment.payment_type));
        } else {
            records = records.filter(r => r.payment?.payment_type === typeFilter);
        }
    }

    // Sort: pending first
    records.sort((a, b) => {
        const statusOrder = { pending: 0, rejected: 1, paid: 2 };
        const sa = a.payment ? (statusOrder[a.payment.payment_status] ?? 3) : 3;
        const sb = b.payment ? (statusOrder[b.payment.payment_status] ?? 3) : 3;
        return sa - sb;
    });

    // Update stats
    updateAdminPayStats(allChildren, monthPayments);

    // Render list view
    const container = document.getElementById('adminPaymentsList');
    if (!container) return;

    if (records.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-neutral-950/20 border border-neutral-800 rounded-2xl">
                <p class="text-xs text-neutral-500 font-semibold">Tiada rekod bayaran untuk paparan ini.</p>
            </div>`;
        return;
    }

    container.innerHTML = records.map(r => {
        const pay = r.payment;
        const status = pay?.payment_status || 'unpaid';
        const monthNames = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogs','Sep','Okt','Nov','Dis'];

        const statusStyles = {
            pending: 'bg-gold-500/10 text-gold-400 border-gold-500/20',
            paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
            unpaid: 'bg-neutral-800/50 text-neutral-400 border-neutral-700'
        };
        const statusLabels = {
            pending: '⏳ Menunggu Semakan',
            paid: '✅ Disahkan',
            rejected: '❌ Ditolak',
            unpaid: '⚪ Belum Bayar'
        };

        const typeLabels = {
            monthly_ihsan: 'Yuran Bulanan',
            monthly: 'Bulanan',
            ihsan: 'Ihsan',
            annual: 'Pendaftaran'
        };

        let payMonth = '-';
        if (pay?.month) {
            const [y, mo] = pay.month.split('-');
            payMonth = `${monthNames[parseInt(mo)-1]} ${y}`;
        }

        const actionBtns = status === 'pending' ? `
            <div class="flex items-center gap-2">
                ${pay?.receipt_image ? `<button onclick="openViewReceipt('${pay.__backendId || ''}')" class="px-2.5 py-1.5 bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/20 text-gold-400 text-[9px] font-bold rounded-lg transition-premium flex items-center gap-1"><i data-lucide="eye" class="w-3 h-3"></i> Lihat Resit</button>` : ''}
                <button onclick="sahkanBayaran('${pay?.__backendId || ''}')" class="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black rounded-lg transition-premium">Sahkan</button>
                <button onclick="openRejectPayment('${pay?.__backendId || ''}')" class="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-bold rounded-lg transition-premium">Tolak</button>
            </div>` :
            (pay?.receipt_image ? `<button onclick="openViewReceipt('${pay.__backendId || ''}')" class="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-[9px] font-bold rounded-lg transition-premium flex items-center gap-1"><i data-lucide="eye" class="w-3 h-3"></i> Lihat Resit</button>` : '');

        return `
            <div class="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="text-xs font-black text-white">${r.name}</h4>
                        <span class="text-[9px] px-2 py-0.5 rounded-lg border font-bold ${statusStyles[status]}">${statusLabels[status]}</span>
                    </div>
                    <p class="text-[10px] text-neutral-400 mt-1">Waris: ${r.guardianName} · 📞 ${r.guardianPhone}</p>
                    <div class="flex items-center gap-3 mt-1 text-[10px] text-neutral-500">
                        <span>📅 ${payMonth}</span>
                        ${pay ? `<span>💰 RM${pay.amount || calculateFee(r.age) + 5}</span>` : ''}
                        ${pay?.payment_type ? `<span>${typeLabels[pay.payment_type] || pay.payment_type}</span>` : ''}
                        ${pay?.payment_date ? `<span>Dibayar: ${formatDateDisplay(pay.payment_date)}</span>` : ''}
                    </div>
                    ${pay?.notes ? `<p class="text-[9px] text-neutral-500 mt-1">📝 ${pay.notes}</p>` : ''}
                    ${pay?.catatan_admin ? `<p class="text-[9px] text-red-400 mt-1">⚠ Admin: ${pay.catatan_admin}</p>` : ''}
                </div>
                <div class="shrink-0">${actionBtns}</div>
            </div>`;
    }).join('');

    lucide.createIcons();

    // Also render member view
    renderAdminPayMemberView(allChildren, monthPayments);
}


// ===== UPDATE ADMIN PAY STATS =====
function updateAdminPayStats(allChildren, monthPayments) {
    const pending = monthPayments.filter(p => p.payment_status === 'pending').length;
    const paid = monthPayments.filter(p => p.payment_status === 'paid').length;
    const rejected = monthPayments.filter(p => p.payment_status === 'rejected').length;
    const paidChildIds = monthPayments.map(p => p.child_id);
    const unpaid = allChildren.filter(c => !paidChildIds.includes(c.id)).length;

    const eP = document.getElementById('statBayaranPending');
    const ePd = document.getElementById('statBayaranPaid');
    const eR = document.getElementById('statBayaranRejected');
    const eU = document.getElementById('statBayaranUnpaid');
    if (eP) eP.textContent = pending;
    if (ePd) ePd.textContent = paid;
    if (eR) eR.textContent = rejected;
    if (eU) eU.textContent = unpaid;
}

// ===== TOGGLE ADMIN PAY VIEW =====
function toggleAdminPayView(view) {
    _adminPayView = view;
    const listView = document.getElementById('adminPayListView');
    const memberView = document.getElementById('adminPayMemberView');
    const listBtn = document.getElementById('payViewListBtn');
    const memberBtn = document.getElementById('payViewMemberBtn');

    if (view === 'list') {
        listView?.classList.remove('hidden');
        memberView?.classList.add('hidden');
        listBtn.className = 'px-3 py-1.5 bg-gold-500 text-neutral-950 text-[10px] font-black rounded-lg transition-premium';
        memberBtn.className = 'px-3 py-1.5 bg-neutral-900 border border-neutral-800 text-neutral-300 text-[10px] font-bold rounded-lg transition-premium hover:bg-neutral-800';
    } else {
        listView?.classList.add('hidden');
        memberView?.classList.remove('hidden');
        memberBtn.className = 'px-3 py-1.5 bg-gold-500 text-neutral-950 text-[10px] font-black rounded-lg transition-premium';
        listBtn.className = 'px-3 py-1.5 bg-neutral-900 border border-neutral-800 text-neutral-300 text-[10px] font-bold rounded-lg transition-premium hover:bg-neutral-800';
    }
}

// ===== RENDER ADMIN PAY MEMBER VIEW (12 bulan) =====
function renderAdminPayMemberView(allChildren, monthPayments) {
    const container = document.getElementById('adminPayMemberList');
    if (!container) return;

    const year = new Date().getFullYear();
    const monthNames = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogs','Sep','Okt','Nov','Dis'];

    // Group children by member (waris)
    const grouped = {};
    allChildren.forEach(c => {
        if (!grouped[c.memberId]) {
            grouped[c.memberId] = { guardianName: c.guardianName, guardianPhone: c.guardianPhone, children: [] };
        }
        grouped[c.memberId].children.push(c);
    });

    container.innerHTML = Object.entries(grouped).map(([memberId, data]) => {
        const childRows = data.children.map(child => {
            const months = Array.from({length: 12}, (_, i) => {
                const monthStr = `${year}-${String(i+1).padStart(2,'0')}`;
                const pay = allPayments.find(p => p.child_id === child.id && p.month === monthStr);
                const status = pay?.payment_status || 'unpaid';
                const colors = {
                    paid: 'bg-emerald-500 text-white',
                    pending: 'bg-gold-500 text-black',
                    rejected: 'bg-red-500 text-white',
                    unpaid: 'bg-neutral-800 text-neutral-500'
                };
                return `<button onclick="openPaymentModal('${child.id}','${monthStr}',${child.age})" title="${monthNames[i]} - ${status === 'paid' ? 'Disahkan' : status === 'pending' ? 'Menunggu' : status === 'rejected' ? 'Ditolak' : 'Belum Bayar'}" class="w-full py-1.5 rounded text-[8px] font-bold ${colors[status]} transition-premium hover:opacity-80">${monthNames[i]}</button>`;
            }).join('');

            return `
                <div class="space-y-2">
                    <p class="text-xs font-bold text-white">${child.name} <span class="text-neutral-500 font-normal">(${child.age} Thn)</span></p>
                    <div class="grid grid-cols-6 sm:grid-cols-12 gap-1">${months}</div>
                </div>`;
        }).join('');

        return `
            <div class="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 space-y-4">
                <div>
                    <h3 class="text-sm font-black text-white uppercase">${data.guardianName}</h3>
                    <p class="text-[10px] text-neutral-400">📞 ${data.guardianPhone}</p>
                </div>
                <div class="space-y-3">${childRows}</div>
                <div class="flex items-center gap-3 text-[8px] text-neutral-500 pt-2 border-t border-neutral-800">
                    <span class="flex items-center gap-1"><span class="w-3 h-3 bg-emerald-500 rounded"></span> Disahkan</span>
                    <span class="flex items-center gap-1"><span class="w-3 h-3 bg-gold-500 rounded"></span> Menunggu</span>
                    <span class="flex items-center gap-1"><span class="w-3 h-3 bg-red-500 rounded"></span> Ditolak</span>
                    <span class="flex items-center gap-1"><span class="w-3 h-3 bg-neutral-800 rounded"></span> Belum Bayar</span>
                </div>
            </div>`;
    }).join('');
}


// ===== SAHKAN BAYARAN =====
function sahkanBayaran(payId) {
    if (!payId) return;
    _viewingPaymentId = payId;
    const pay = allPayments.find(p => p.__backendId === payId);
    if (!pay) return;

    const childName = pay.child_id?.split('_').slice(1).join(' ') || '-';
    document.getElementById('confirmPaymentInfo').textContent =
        `Sahkan bayaran ${childName} untuk bulan ${formatMonthDisplay(pay.month)}?`;

    const modal = document.getElementById('confirmPaymentModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    lucide.createIcons();
}

function closeConfirmPaymentModal() {
    const modal = document.getElementById('confirmPaymentModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

async function confirmSahkanPayment() {
    if (!_viewingPaymentId) return;
    const pay = allPayments.find(p => p.__backendId === _viewingPaymentId);
    if (!pay) return;

    pay.payment_status = 'paid';
    pay.approvedBy = firebaseUser?.uid || '';
    pay.approvedAt = new Date().toISOString();
    pay.updatedAt = new Date().toISOString();

    const res = await dataSdk.update(pay);
    if (res.isOk) {
        showToast('Bayaran telah disahkan.', 'success');
        closeConfirmPaymentModal();
        closeViewReceiptModal();
        renderAdminPayments();
    } else {
        showToast('Gagal mengesahkan bayaran.', 'error');
    }
}

// ===== TOLAK BAYARAN =====
function openRejectPayment(payId) {
    if (!payId) return;
    _rejectingPaymentId = payId;
    const pay = allPayments.find(p => p.__backendId === payId);
    if (!pay) return;

    const childName = pay.child_id?.split('_').slice(1).join(' ') || '-';
    document.getElementById('rejectPaymentInfo').innerHTML =
        `<strong>${childName}</strong> — Bulan: ${formatMonthDisplay(pay.month)}`;
    document.getElementById('rejectPaymentNote').value = '';

    // Show receipt preview if available
    const previewEl = document.getElementById('rejectPaymentReceiptPreview');
    const imgEl = document.getElementById('rejectPaymentReceiptImg');
    if (pay.receipt_image && previewEl && imgEl) {
        imgEl.src = pay.receipt_image;
        previewEl.classList.remove('hidden');
    } else if (previewEl) {
        previewEl.classList.add('hidden');
    }

    const modal = document.getElementById('rejectPaymentModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    lucide.createIcons();
}

function closeRejectPaymentModal() {
    const modal = document.getElementById('rejectPaymentModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    _rejectingPaymentId = null;
}

async function confirmRejectPayment() {
    if (!_rejectingPaymentId) return;
    const note = document.getElementById('rejectPaymentNote')?.value.trim();
    if (!note) {
        showToast('Catatan admin wajib diisi untuk penolakan.', 'error');
        return;
    }

    const pay = allPayments.find(p => p.__backendId === _rejectingPaymentId);
    if (!pay) return;

    pay.payment_status = 'rejected';
    pay.rejectedBy = firebaseUser?.uid || '';
    pay.rejectedAt = new Date().toISOString();
    pay.catatan_admin = note;
    pay.updatedAt = new Date().toISOString();

    const res = await dataSdk.update(pay);
    if (res.isOk) {
        showToast('Bayaran telah ditolak.', 'success');
        closeRejectPaymentModal();
        closeViewReceiptModal();
        renderAdminPayments();
    } else {
        showToast('Gagal menolak bayaran.', 'error');
    }
}


// ===== VIEW RECEIPT MODAL =====
function openViewReceipt(payId) {
    if (!payId) return;
    _viewingPaymentId = payId;
    const pay = allPayments.find(p => p.__backendId === payId);
    if (!pay) return;

    const childName = pay.child_id?.split('_').slice(1).join(' ') || '-';
    const member = allMembers.find(m => pay.child_id?.startsWith(m.__backendId + '_'));

    const content = document.getElementById('viewReceiptContent');
    content.innerHTML = `
        <div class="space-y-4">
            ${pay.receipt_image ? `
                <div class="bg-neutral-900 rounded-xl p-3 flex items-center justify-center">
                    <img src="${pay.receipt_image}" class="max-h-64 object-contain rounded-lg cursor-pointer" onclick="window.open('${pay.receipt_image}','_blank')">
                </div>` : `
                <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-6 text-center">
                    <p class="text-xs text-neutral-500">Tiada resit dimuat naik.</p>
                </div>`}
            <div class="grid grid-cols-2 gap-3 text-xs">
                <div><span class="text-[9px] text-neutral-500">Nama Ahli</span><br><span class="font-bold text-white">${childName}</span></div>
                <div><span class="text-[9px] text-neutral-500">Nama Waris</span><br><span class="font-bold text-white">${member?.guardian_name || '-'}</span></div>
                <div><span class="text-[9px] text-neutral-500">Telefon Waris</span><br><span class="font-bold text-white">${member?.guardian_phone || '-'}</span></div>
                <div><span class="text-[9px] text-neutral-500">Bulan Bayaran</span><br><span class="font-bold text-white">${formatMonthDisplay(pay.month)}</span></div>
                <div><span class="text-[9px] text-neutral-500">Jumlah</span><br><span class="font-bold text-gold-400">RM ${pay.amount || '-'}</span></div>
                <div><span class="text-[9px] text-neutral-500">Tarikh Bayaran</span><br><span class="font-bold text-white">${pay.payment_date ? formatDateDisplay(pay.payment_date) : '-'}</span></div>
                <div class="col-span-2"><span class="text-[9px] text-neutral-500">Status</span><br><span class="font-bold ${pay.payment_status === 'paid' ? 'text-emerald-400' : pay.payment_status === 'rejected' ? 'text-red-400' : 'text-gold-400'}">${pay.payment_status === 'paid' ? '✅ Disahkan' : pay.payment_status === 'rejected' ? '❌ Ditolak' : '⏳ Menunggu Semakan'}</span></div>
            </div>
            ${pay.notes ? `<p class="text-[10px] text-neutral-400">📝 Catatan waris: ${pay.notes}</p>` : ''}
            ${pay.catatan_admin ? `<p class="text-[10px] text-red-400">⚠ Catatan admin: ${pay.catatan_admin}</p>` : ''}
        </div>
    `;

    // Show/hide action buttons based on status
    const sahkanBtn = document.getElementById('modalSahkanBtn');
    const tolakBtn = document.getElementById('modalTolakBtn');
    if (pay.payment_status === 'pending') {
        sahkanBtn?.classList.remove('hidden');
        tolakBtn?.classList.remove('hidden');
    } else {
        sahkanBtn?.classList.add('hidden');
        tolakBtn?.classList.add('hidden');
    }

    const modal = document.getElementById('viewReceiptModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    lucide.createIcons();
}

function closeViewReceiptModal() {
    const modal = document.getElementById('viewReceiptModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function sahkanBayaranFromModal() {
    if (_viewingPaymentId) sahkanBayaran(_viewingPaymentId);
}

function tolakBayaranFromModal() {
    if (_viewingPaymentId) openRejectPayment(_viewingPaymentId);
}

// ===== ACCESS CONTROL - Check admin access =====
function checkAdminAccess() {
    const isAdmin = currentUser && (currentUser.is_admin === true || currentUser.is_admin === 'true');
    if (!isAdmin && _currentUserRole !== 'superadmin' && _currentUserRole !== 'admin') {
        return false;
    }
    return true;
}
