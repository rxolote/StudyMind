import { initializeApp } from "firebase/app";
import {
    getAuth,
    GoogleAuthProvider,
    OAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "firebase/auth";
import {
    getDatabase,
    ref,
    set,
    get,
    push,
    query,
    orderByChild,
    equalTo
} from "firebase/database";

// === CONFIGURAÇÃO DO FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyBAkHQ_g2ADrUUd8jPI6ZXl899NzmCG7eE",
    authDomain: "studymind-9ca07.firebaseapp.com",
    projectId: "studymind-9ca07",
    storageBucket: "studymind-9ca07.firebasestorage.app",
    messagingSenderId: "147660747676",
    appId: "1:147660747676:web:a3f5746a187d3f0c8f8e59",
    // ⚠️ Substitua pelo URL do seu Realtime Database (Console → Realtime Database)
    databaseURL: "https://studymind-9ca07-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// === PROVEDORES ===
const googleProvider = new GoogleAuthProvider();
const microsoftProvider = new OAuthProvider('microsoft.com');

// === ELEMENTOS DA UI ===
const authScreen = document.getElementById('auth-screen');
const studentDashboard = document.getElementById('student-dashboard');
const companyDashboard = document.getElementById('company-dashboard');

const btnGoogle = document.getElementById('btn-google');
const btnMicrosoft = document.getElementById('btn-microsoft');
const formEmailAuth = document.getElementById('form-email-auth');
const btnEmailAuth = document.getElementById('btn-email-auth');
const toggleAuthMode = document.getElementById('toggle-auth-mode');
const toggleText = document.getElementById('toggle-text');
const roleSelection = document.getElementById('role-selection');

let isSignUpMode = false;

// === ALTERNAR ENTRE LOGIN E CADASTRO ===
toggleAuthMode.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUpMode = !isSignUpMode;
    if (isSignUpMode) {
        toggleText.textContent = "Já tem uma conta?";
        toggleAuthMode.textContent = "Faça login";
        roleSelection.classList.remove('hidden');
        btnEmailAuth.textContent = "Cadastrar";
    } else {
        toggleText.textContent = "Ainda não tem conta?";
        toggleAuthMode.textContent = "Cadastre-se";
        roleSelection.classList.add('hidden');
        btnEmailAuth.textContent = "Entrar / Cadastrar";
    }
});

// === UTILITÁRIOS ===
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 5000);
    }
}

function hideAllScreens() {
    authScreen.classList.remove('active');
    studentDashboard.classList.remove('active');
    companyDashboard.classList.remove('active');
}

// === USUÁRIO NO REALTIME DATABASE ===
async function ensureUserDocument(user, role = null) {
    const userRef = ref(db, 'users/' + user.uid);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        const finalRole = role || 'student';
        await set(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || '',
            role: finalRole,
            createdAt: Date.now()
        });
        return finalRole;
    }
    return snapshot.val().role;
}

async function redirectBasedOnRole(user) {
    const role = await ensureUserDocument(user);
    hideAllScreens();

    if (role === 'company') {
        companyDashboard.classList.add('active');
        loadCompanyCourses(user.uid);
        loadCoursesForSelect(user.uid);
    } else {
        studentDashboard.classList.add('active');
        loadStudentClasses(user.uid);
    }
}

// === AUTENTICAÇÃO SOCIAL ===
btnGoogle.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        await redirectBasedOnRole(result.user);
    } catch (error) {
        showError('auth-error', 'Erro ao entrar com Google: ' + error.message);
    }
});

btnMicrosoft.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, microsoftProvider);
        await redirectBasedOnRole(result.user);
    } catch (error) {
        showError('auth-error', 'Erro ao entrar com Microsoft: ' + error.message);
    }
});

// === AUTENTICAÇÃO POR E-MAIL ===
formEmailAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        if (isSignUpMode) {
            const role = document.querySelector('input[name="role"]:checked').value;
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await ensureUserDocument(userCredential.user, role);
            await redirectBasedOnRole(userCredential.user);
        } else {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await redirectBasedOnRole(userCredential.user);
        }
    } catch (error) {
        showError('auth-error', error.message.replace('Firebase: ', ''));
    }
});

// === OBSERVADOR DE ESTADO ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await redirectBasedOnRole(user);
    } else {
        hideAllScreens();
        authScreen.classList.add('active');
    }
});

// === LOGOUT ===
document.getElementById('btn-logout-student').addEventListener('click', () => signOut(auth));
document.getElementById('btn-logout-company').addEventListener('click', () => signOut(auth));

// =====================================================
// FUNÇÕES DA EMPRESA
// =====================================================

// Criar curso
document.getElementById('form-create-course').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const title = document.getElementById('course-title').value.trim();
    const description = document.getElementById('course-description').value.trim();

    try {
        const newCourseRef = push(ref(db, 'courses'));
        await set(newCourseRef, {
            companyId: user.uid,
            title,
            description,
            createdAt: Date.now()
        });
        document.getElementById('form-create-course').reset();
        loadCompanyCourses(user.uid);
        loadCoursesForSelect(user.uid);
    } catch (error) {
        showError('course-error', 'Erro ao criar curso: ' + error.message);
    }
});

// Listar cursos da empresa
async function loadCompanyCourses(companyId) {
    const list = document.getElementById('company-courses-list');
    list.innerHTML = '<p class="empty-state">Carregando...</p>';

    const coursesQuery = query(
        ref(db, 'courses'),
        orderByChild('companyId'),
        equalTo(companyId)
    );
    const snapshot = await get(coursesQuery);

    if (!snapshot.exists()) {
        list.innerHTML = '<p class="empty-state">Nenhum curso criado ainda.</p>';
        return;
    }

    list.innerHTML = '';
    const courses = snapshot.val();
    Object.entries(courses).forEach(([id, course]) => {
        const div = document.createElement('div');
        div.className = 'course-item';
        div.innerHTML = `
            <strong>${course.title}</strong>
            <span class="meta">${course.description}</span>
        `;
        list.appendChild(div);
    });
}

// Preencher select com os cursos da empresa
async function loadCoursesForSelect(companyId) {
    const select = document.getElementById('select-course-for-class');
    select.innerHTML = '<option value="">Selecione um curso</option>';

    const coursesQuery = query(
        ref(db, 'courses'),
        orderByChild('companyId'),
        equalTo(companyId)
    );
    const snapshot = await get(coursesQuery);

    if (!snapshot.exists()) return;

    const courses = snapshot.val();
    Object.entries(courses).forEach(([id, course]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = course.title;
        select.appendChild(option);
    });
}

// Gerar código de convite (o código é a própria chave)
document.getElementById('btn-generate-invite').addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    const courseId = document.getElementById('select-course-for-class').value;
    if (!courseId) {
        alert('Selecione um curso primeiro.');
        return;
    }

    // Gera código único e verifica colisão
    let inviteCode;
    let attempts = 0;
    do {
        inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const check = await get(ref(db, 'inviteCodes/' + inviteCode));
        if (!check.exists()) break;
        attempts++;
    } while (attempts < 5);

    try {
        await set(ref(db, 'inviteCodes/' + inviteCode), {
            courseId: courseId,
            companyId: user.uid,
            createdAt: Date.now()
        });

        document.getElementById('generated-code').textContent = inviteCode;
        document.getElementById('invite-result').classList.remove('hidden');
    } catch (error) {
        alert('Erro ao gerar código: ' + error.message);
    }
});

// =====================================================
// FUNÇÕES DO ESTUDANTE
// =====================================================

// Ingressar em turma
document.getElementById('form-join-class').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const codeInput = document.getElementById('invite-code').value.trim().toUpperCase();

    try {
        // 1. Busca direta pelo código (chave)
        const inviteSnap = await get(ref(db, 'inviteCodes/' + codeInput));
        if (!inviteSnap.exists()) {
            showError('join-error', 'Código inválido ou expirado.');
            return;
        }

        const { courseId } = inviteSnap.val();

        // 2. Verifica se já está matriculado (checagem O(1) via caminho)
        const enrollRef = ref(db, `enrollments/${user.uid}/${courseId}`);
        const existing = await get(enrollRef);
        if (existing.exists()) {
            showError('join-error', 'Você já está matriculado neste curso.');
            return;
        }

        // 3. Cria a matrícula
        await set(enrollRef, {
            enrolledAt: Date.now(),
            inviteCode: codeInput
        });

        document.getElementById('form-join-class').reset();
        loadStudentClasses(user.uid);
        alert('Matrícula realizada com sucesso!');
    } catch (error) {
        showError('join-error', 'Erro ao entrar na turma: ' + error.message);
    }
});

// Listar turmas do estudante
async function loadStudentClasses(studentId) {
    const list = document.getElementById('student-classes-list');
    list.innerHTML = '<p class="empty-state">Carregando...</p>';

    const enrollSnap = await get(ref(db, 'enrollments/' + studentId));

    if (!enrollSnap.exists()) {
        list.innerHTML = '<p class="empty-state">Você ainda não está matriculado em nenhuma turma.</p>';
        return;
    }

    list.innerHTML = '';
    const enrollments = enrollSnap.val();

    for (const courseId of Object.keys(enrollments)) {
        const enrollment = enrollments[courseId];
        const courseSnap = await get(ref(db, 'courses/' + courseId));

        if (courseSnap.exists()) {
            const course = courseSnap.val();
            const div = document.createElement('div');
            div.className = 'class-item';
            div.innerHTML = `
                <strong>${course.title}</strong>
                <span class="meta">${course.description}</span>
                <span class="meta">Matriculado em: ${new Date(enrollment.enrolledAt).toLocaleDateString()}</span>
            `;
            list.appendChild(div);
        }
    }
}
