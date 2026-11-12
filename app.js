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
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    serverTimestamp
} from "firebase/firestore";

// === CONFIGURAÇÃO DO FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyBAkHQ_g2ADrUUd8jPI6ZXl899NzmCG7eE",
    authDomain: "studymind-9ca07.firebaseapp.com",
    projectId: "studymind-9ca07",
    storageBucket: "studymind-9ca07.firebasestorage.app",
    messagingSenderId: "147660747676",
    appId: "1:147660747676:web:a3f5746a187d3f0c8f8e59"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === PROVEDORES ===
const googleProvider = new GoogleAuthProvider();
const microsoftProvider = new OAuthProvider('microsoft.com');
// Se necessário, restrinja a um tenant específico:
// microsoftProvider.setCustomParameters({ tenant: 'SEU_TENANT_ID_OU_DOMINIO' });[reference:1]

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
const authError = document.getElementById('auth-error');

let isSignUpMode = false; // Controla se o formulário de e-mail é para cadastro ou login

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

// === FUNÇÕES AUXILIARES ===
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

// === SALVAR USUÁRIO NO FIRESTORE (se ainda não existir) ===
async function ensureUserDocument(user, role = null) {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        // Se um papel não foi fornecido (ex: login social), usa 'student' como padrão
        const finalRole = role || 'student';
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || '',
            role: finalRole,
            createdAt: serverTimestamp()
        });
        return finalRole;
    }
    return userSnap.data().role;
}

// === REDIRECIONAR COM BASE NO PAPEL ===
async function redirectBasedOnRole(user) {
    const role = await ensureUserDocument(user); // Lê o papel existente
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

// === AUTENTICAÇÃO COM GOOGLE ===
btnGoogle.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        await redirectBasedOnRole(result.user);
    } catch (error) {
        showError('auth-error', 'Erro ao entrar com Google: ' + error.message);
    }
});

// === AUTENTICAÇÃO COM MICROSOFT ===
btnMicrosoft.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, microsoftProvider);
        await redirectBasedOnRole(result.user);
    } catch (error) {
        showError('auth-error', 'Erro ao entrar com Microsoft: ' + error.message);
    }
});

// === AUTENTICAÇÃO COM E-MAIL/SENHA ===
formEmailAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        if (isSignUpMode) {
            // Cadastro
            const role = document.querySelector('input[name="role"]:checked').value;
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await ensureUserDocument(userCredential.user, role);
            await redirectBasedOnRole(userCredential.user);
        } else {
            // Login
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await redirectBasedOnRole(userCredential.user);
        }
    } catch (error) {
        showError('auth-error', error.message.replace('Firebase: ', ''));
    }
});

// === OBSERVADOR DE ESTADO DE AUTENTICAÇÃO ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Usuário logado: verifica o documento e redireciona
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            await redirectBasedOnRole(user);
        } else {
            // Usuário autenticado mas sem documento (ex: primeiro login social)
            // Cria com papel padrão 'student'
            await ensureUserDocument(user, 'student');
            await redirectBasedOnRole(user);
        }
    } else {
        // Usuário deslogado
        hideAllScreens();
        authScreen.classList.add('active');
    }
});

// === LOGOUT ===
document.getElementById('btn-logout-student').addEventListener('click', () => signOut(auth));
document.getElementById('btn-logout-company').addEventListener('click', () => signOut(auth));

// === FUNÇÕES DA EMPRESA ===

// Criar Curso
document.getElementById('form-create-course').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const title = document.getElementById('course-title').value.trim();
    const description = document.getElementById('course-description').value.trim();

    try {
        await addDoc(collection(db, 'courses'), {
            companyId: user.uid,
            title,
            description,
            createdAt: serverTimestamp()
        });
        document.getElementById('form-create-course').reset();
        loadCompanyCourses(user.uid);
        loadCoursesForSelect(user.uid);
    } catch (error) {
        showError('course-error', 'Erro ao criar curso: ' + error.message);
    }
});

// Carregar cursos da empresa
async function loadCompanyCourses(companyId) {
    const list = document.getElementById('company-courses-list');
    list.innerHTML = '<p class="empty-state">Carregando...</p>';

    const q = query(collection(db, 'courses'), where('companyId', '==', companyId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        list.innerHTML = '<p class="empty-state">Nenhum curso criado ainda.</p>';
        return;
    }

    list.innerHTML = '';
    snapshot.forEach((docSnap) => {
        const course = docSnap.data();
        const div = document.createElement('div');
        div.className = 'course-item';
        div.innerHTML = `
            <strong>${course.title}</strong>
            <span class="meta">${course.description}</span>
        `;
        list.appendChild(div);
    });
}

// Preencher select de cursos para gerar turma
async function loadCoursesForSelect(companyId) {
    const select = document.getElementById('select-course-for-class');
    select.innerHTML = '<option value="">Selecione um curso</option>';

    const q = query(collection(db, 'courses'), where('companyId', '==', companyId));
    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
        const course = docSnap.data();
        const option = document.createElement('option');
        option.value = docSnap.id;
        option.textContent = course.title;
        select.appendChild(option);
    });
}

// Gerar Código de Turma (convite)
document.getElementById('btn-generate-invite').addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    const courseId = document.getElementById('select-course-for-class').value;
    if (!courseId) {
        alert('Selecione um curso primeiro.');
        return;
    }

    // Gera um código curto e único (pode ser melhorado)
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
        await addDoc(collection(db, 'inviteCodes'), {
            code: inviteCode,
            courseId: courseId,
            companyId: user.uid,
            createdAt: serverTimestamp()
        });

        document.getElementById('generated-code').textContent = inviteCode;
        document.getElementById('invite-result').classList.remove('hidden');
    } catch (error) {
        alert('Erro ao gerar código: ' + error.message);
    }
});

// === FUNÇÕES DO ESTUDANTE ===

// Ingressar em Turma via Código
document.getElementById('form-join-class').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const codeInput = document.getElementById('invite-code').value.trim().toUpperCase();
    const joinError = document.getElementById('join-error');
    joinError.classList.add('hidden');

    try {
        // 1. Buscar o código de convite
        const inviteQuery = query(collection(db, 'inviteCodes'), where('code', '==', codeInput));
        const inviteSnap = await getDocs(inviteQuery);

        if (inviteSnap.empty) {
            showError('join-error', 'Código inválido ou expirado.');
            return;
        }

        const inviteData = inviteSnap.docs[0].data();
        const courseId = inviteData.courseId;

        // 2. Verificar se o aluno já está matriculado neste curso
        const enrollmentQuery = query(
            collection(db, 'enrollments'),
            where('studentId', '==', user.uid),
            where('courseId', '==', courseId)
        );
        const existingEnrollment = await getDocs(enrollmentQuery);

        if (!existingEnrollment.empty) {
            showError('join-error', 'Você já está matriculado neste curso.');
            return;
        }

        // 3. Criar matrícula
        await addDoc(collection(db, 'enrollments'), {
            studentId: user.uid,
            courseId: courseId,
            inviteCode: codeInput,
            enrolledAt: serverTimestamp()
        });

        document.getElementById('form-join-class').reset();
        loadStudentClasses(user.uid);
        alert('Matrícula realizada com sucesso!');
    } catch (error) {
        showError('join-error', 'Erro ao entrar na turma: ' + error.message);
    }
});

// Carregar turmas do estudante
async function loadStudentClasses(studentId) {
    const list = document.getElementById('student-classes-list');
    list.innerHTML = '<p class="empty-state">Carregando...</p>';

    const enrollQuery = query(collection(db, 'enrollments'), where('studentId', '==', studentId));
    const enrollSnap = await getDocs(enrollQuery);

    if (enrollSnap.empty) {
        list.innerHTML = '<p class="empty-state">Você ainda não está matriculado em nenhuma turma.</p>';
        return;
    }

    list.innerHTML = '';
    for (const enrollDoc of enrollSnap.docs) {
        const enrollment = enrollDoc.data();
        const courseRef = doc(db, 'courses', enrollment.courseId);
        const courseSnap = await getDoc(courseRef);

        if (courseSnap.exists()) {
            const course = courseSnap.data();
            const div = document.createElement('div');
            div.className = 'class-item';
            div.innerHTML = `
                <strong>${course.title}</strong>
                <span class="meta">${course.description}</span>
                <span class="meta">Matriculado em: ${enrollment.enrolledAt ? new Date(enrollment.enrolledAt.toDate()).toLocaleDateString() : '—'}</span>
            `;
            list.appendChild(div);
        }
    }
}