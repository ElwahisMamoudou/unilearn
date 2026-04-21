from sqlalchemy import (
    create_engine, Column, Integer, String,
    DateTime, ForeignKey, Boolean, Text, Float, Table
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import os, json

os.makedirs("./db", exist_ok=True)
DATABASE_URL = "sqlite:///./db/unilearn.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ══════════════════════════════════════════════════════
#  TABLE D'ASSOCIATION : étudiants ↔ classes
# ══════════════════════════════════════════════════════

class_students = Table(
    "class_students",
    Base.metadata,
    Column("class_id",   Integer, ForeignKey("class_groups.id"), primary_key=True),
    Column("student_id", Integer, ForeignKey("users.id"),        primary_key=True),
)


# ══════════════════════════════════════════════════════
#  UTILISATEURS
# ══════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"
    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(120), nullable=False)
    email       = Column(String(200), unique=True, index=True, nullable=False)
    hashed_pwd  = Column(String(200), nullable=False)
    role        = Column(String(20), default="student")   # student | teacher | admin
    avatar_url  = Column(String(300), nullable=True)
    matricule   = Column(String(50), nullable=True, unique=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    is_active   = Column(Boolean, default=True)

    enrollments          = relationship("Enrollment",          back_populates="student")
    courses              = relationship("Course",              back_populates="teacher")
    progress             = relationship("Progress",            back_populates="user")
    sent_messages        = relationship("Message",             foreign_keys="Message.sender_id",   back_populates="sender")
    received_messages    = relationship("Message",             foreign_keys="Message.receiver_id", back_populates="receiver")
    forum_questions      = relationship("ForumQuestion",       back_populates="author")
    forum_replies        = relationship("ForumReply",          back_populates="author")
    exam_submissions     = relationship("ExamSubmission",      back_populates="student")
    notifications        = relationship("Notification",        back_populates="user",    cascade="all, delete")
    login_history        = relationship("LoginHistory",        back_populates="user",    cascade="all, delete")
    homework_submissions = relationship("HomeworkSubmission",  back_populates="student")
    class_groups         = relationship("ClassGroup",          secondary=class_students, back_populates="students")
    managed_classes      = relationship("ClassGroup",          back_populates="teacher", foreign_keys="ClassGroup.teacher_id")


class LoginHistory(Base):
    __tablename__ = "login_history"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    ip_address = Column(String(50),  nullable=True)
    user_agent = Column(String(300), nullable=True)
    success    = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="login_history")


# ══════════════════════════════════════════════════════
#  ANNÉES ACADÉMIQUES & SEMESTRES
# ══════════════════════════════════════════════════════

class AcademicYear(Base):
    __tablename__ = "academic_years"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(20), nullable=False)   # ex: "2024-2025"
    start_date = Column(DateTime,   nullable=False)
    end_date   = Column(DateTime,   nullable=False)
    is_current = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    semesters    = relationship("Semester",   back_populates="academic_year", cascade="all, delete")
    class_groups = relationship("ClassGroup", back_populates="academic_year")


class Semester(Base):
    __tablename__ = "semesters"
    id               = Column(Integer, primary_key=True, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False)
    name             = Column(String(50), nullable=False)
    start_date       = Column(DateTime,   nullable=False)
    end_date         = Column(DateTime,   nullable=False)
    is_current       = Column(Boolean, default=False)

    academic_year = relationship("AcademicYear", back_populates="semesters")
    courses       = relationship("Course",       back_populates="semester")


# ══════════════════════════════════════════════════════
#  CLASSES (ClassGroup)
# ══════════════════════════════════════════════════════

class ClassGroup(Base):
    __tablename__ = "class_groups"
    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String(100), nullable=False)
    code             = Column(String(20),  nullable=True)
    description      = Column(Text,        nullable=True)
    level            = Column(String(50),  nullable=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    teacher_id       = Column(Integer, ForeignKey("users.id"), nullable=True)
    max_students     = Column(Integer, default=50)
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime, default=datetime.utcnow)

    academic_year = relationship("AcademicYear", back_populates="class_groups")
    teacher       = relationship("User",         back_populates="managed_classes", foreign_keys=[teacher_id])
    students      = relationship("User",         secondary=class_students,         back_populates="class_groups")
    courses       = relationship("Course",       back_populates="class_group",     cascade="all, delete")


# ══════════════════════════════════════════════════════
#  CATÉGORIES & COURS
# ══════════════════════════════════════════════════════

class Category(Base):
    __tablename__ = "categories"
    id      = Column(Integer, primary_key=True, index=True)
    name    = Column(String(80), unique=True, nullable=False)
    color   = Column(String(20), default="#1E4DB7")
    icon    = Column(String(10), default="")
    courses = relationship("Course", back_populates="category")


class Course(Base):
    __tablename__ = "courses"
    id             = Column(Integer, primary_key=True, index=True)
    title          = Column(String(200), nullable=False)
    description    = Column(Text,        nullable=True)
    thumbnail      = Column(String(300), nullable=True)
    teacher_id     = Column(Integer, ForeignKey("users.id"))
    category_id    = Column(Integer, ForeignKey("categories.id"))
    semester_id    = Column(Integer, ForeignKey("semesters.id"),    nullable=True)
    class_group_id = Column(Integer, ForeignKey("class_groups.id"), nullable=True)
    is_published   = Column(Boolean, default=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    teacher         = relationship("User",          back_populates="courses")
    category        = relationship("Category",      back_populates="courses")
    semester        = relationship("Semester",      back_populates="courses")
    class_group     = relationship("ClassGroup",    back_populates="courses")
    lessons         = relationship("Lesson",        back_populates="course",  cascade="all, delete")
    enrollments     = relationship("Enrollment",    back_populates="course",  cascade="all, delete")
    forum_questions = relationship("ForumQuestion", back_populates="course",  cascade="all, delete")
    exams           = relationship("Exam",          back_populates="course",  cascade="all, delete")
    sessions        = relationship("VideoSession",  back_populates="course",  cascade="all, delete")
    homeworks       = relationship("Homework",      back_populates="course",  cascade="all, delete")


class Lesson(Base):
    __tablename__ = "lessons"
    id          = Column(Integer, primary_key=True, index=True)
    course_id   = Column(Integer, ForeignKey("courses.id"))
    title       = Column(String(200), nullable=False)
    description = Column(Text,  nullable=True)
    type        = Column(String(10), nullable=False)
    file_path   = Column(String(400), nullable=True)
    duration    = Column(String(20),  nullable=True)
    order       = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.utcnow)

    course   = relationship("Course",   back_populates="lessons")
    progress = relationship("Progress", back_populates="lesson", cascade="all, delete")


class Enrollment(Base):
    __tablename__ = "enrollments"
    id           = Column(Integer, primary_key=True, index=True)
    student_id   = Column(Integer, ForeignKey("users.id"))
    course_id    = Column(Integer, ForeignKey("courses.id"))
    enrolled_at  = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    student = relationship("User",   back_populates="enrollments")
    course  = relationship("Course", back_populates="enrollments")


class Progress(Base):
    __tablename__ = "progress"
    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"))
    lesson_id   = Column(Integer, ForeignKey("lessons.id"))
    completed   = Column(Boolean, default=False)
    last_page   = Column(Integer, default=0)
    watched_sec = Column(Integer, default=0)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user   = relationship("User",   back_populates="progress")
    lesson = relationship("Lesson", back_populates="progress")


# ══════════════════════════════════════════════════════
#  MESSAGERIE
# ══════════════════════════════════════════════════════

class Message(Base):
    __tablename__ = "messages"
    id          = Column(Integer, primary_key=True, index=True)
    sender_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    subject     = Column(String(200), nullable=False)
    body        = Column(Text, nullable=False)
    is_read     = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=datetime.utcnow)

    sender   = relationship("User", foreign_keys=[sender_id],   back_populates="sent_messages")
    receiver = relationship("User", foreign_keys=[receiver_id], back_populates="received_messages")


# ══════════════════════════════════════════════════════
#  FORUM
# ══════════════════════════════════════════════════════

class ForumQuestion(Base):
    __tablename__ = "forum_questions"
    id         = Column(Integer, primary_key=True, index=True)
    course_id  = Column(Integer, ForeignKey("courses.id"), nullable=False)
    author_id  = Column(Integer, ForeignKey("users.id"),   nullable=False)
    title      = Column(String(300), nullable=False)
    body       = Column(Text, nullable=False)
    is_closed  = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    course  = relationship("Course", back_populates="forum_questions")
    author  = relationship("User",   back_populates="forum_questions")
    replies = relationship("ForumReply", back_populates="question", cascade="all, delete")


class ForumReply(Base):
    __tablename__ = "forum_replies"
    id          = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("forum_questions.id"), nullable=False)
    author_id   = Column(Integer, ForeignKey("users.id"),           nullable=False)
    body        = Column(Text, nullable=False)
    is_pinned   = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=datetime.utcnow)

    question = relationship("ForumQuestion", back_populates="replies")
    author   = relationship("User",          back_populates="forum_replies")


# ══════════════════════════════════════════════════════
#  ÉVALUATIONS
# ══════════════════════════════════════════════════════

class Exam(Base):
    __tablename__ = "exams"
    id                = Column(Integer, primary_key=True, index=True)
    course_id         = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title             = Column(String(200), nullable=False)
    description       = Column(Text,  nullable=True)
    duration_min      = Column(Integer, default=60)
    starts_at         = Column(DateTime, nullable=True)
    ends_at           = Column(DateTime, nullable=True)
    is_published      = Column(Boolean, default=False)
    shuffle_questions = Column(Boolean, default=False)
    max_attempts      = Column(Integer, default=1)
    passing_score     = Column(Float,   nullable=True)
    show_score_after  = Column(String(20), default="immediately")
    created_at        = Column(DateTime, default=datetime.utcnow)

    course      = relationship("Course",         back_populates="exams")
    questions   = relationship("ExamQuestion",   back_populates="exam", cascade="all, delete")
    submissions = relationship("ExamSubmission", back_populates="exam", cascade="all, delete")


class ExamQuestion(Base):
    __tablename__ = "exam_questions"
    id          = Column(Integer, primary_key=True, index=True)
    exam_id     = Column(Integer, ForeignKey("exams.id"), nullable=False)
    order       = Column(Integer, default=0)
    type        = Column(String(20), nullable=False)
    text        = Column(Text, nullable=False)
    _choices    = Column("choices", Text, nullable=True)
    answer      = Column(String(200), nullable=True)
    points      = Column(Float, default=1.0)
    explanation = Column(Text, nullable=True)

    exam = relationship("Exam", back_populates="questions")

    @property
    def choices(self):
        try:
            return json.loads(self._choices) if self._choices else None
        except Exception:
            return None

    @choices.setter
    def choices(self, value):
        self._choices = json.dumps(value, ensure_ascii=False) if value is not None else None


class ExamSubmission(Base):
    __tablename__ = "exam_submissions"
    id             = Column(Integer, primary_key=True, index=True)
    exam_id        = Column(Integer, ForeignKey("exams.id"),  nullable=False)
    student_id     = Column(Integer, ForeignKey("users.id"),  nullable=False)
    _answers       = Column("answers",       Text, nullable=False, default="{}")
    _grade_details = Column("grade_details", Text, nullable=True)
    score          = Column(Float,   nullable=True)
    max_score      = Column(Float,   nullable=True)
    graded         = Column(Boolean, default=False)
    submitted_at   = Column(DateTime, default=datetime.utcnow)
    file_path      = Column(String(400), nullable=True)
    violations     = Column(Integer, default=0)
    forced         = Column(Boolean, default=False)

    exam    = relationship("Exam", back_populates="submissions")
    student = relationship("User", back_populates="exam_submissions")

    @property
    def answers(self):
        try:
            return json.loads(self._answers) if self._answers else {}
        except Exception:
            return {}

    @answers.setter
    def answers(self, value):
        self._answers = json.dumps(value, ensure_ascii=False) if value is not None else "{}"

    @property
    def grade_details(self):
        try:
            return json.loads(self._grade_details) if self._grade_details else {}
        except Exception:
            return {}

    @grade_details.setter
    def grade_details(self, value):
        self._grade_details = json.dumps(value, ensure_ascii=False) if value is not None else None


class ExamViolation(Base):
    __tablename__  = "exam_violations"
    id             = Column(Integer, primary_key=True, index=True)
    exam_id        = Column(Integer, ForeignKey("exams.id"),  nullable=False)
    student_id     = Column(Integer, ForeignKey("users.id"),  nullable=False)
    violation_type = Column(String(50), default="tab_switch")
    count          = Column(Integer, default=1)
    created_at     = Column(DateTime, default=datetime.utcnow)


# ══════════════════════════════════════════════════════
#  DEVOIRS
# ══════════════════════════════════════════════════════

class Homework(Base):
    __tablename__ = "homeworks"
    id           = Column(Integer, primary_key=True, index=True)
    course_id    = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title        = Column(String(200), nullable=False)
    description  = Column(Text,  nullable=True)
    due_date     = Column(DateTime, nullable=False)
    max_score    = Column(Float, default=20.0)
    is_published = Column(Boolean, default=False)
    created_at   = Column(DateTime, default=datetime.utcnow)

    course      = relationship("Course",             back_populates="homeworks")
    submissions = relationship("HomeworkSubmission", back_populates="homework", cascade="all, delete")


class HomeworkSubmission(Base):
    __tablename__ = "homework_submissions"
    id           = Column(Integer, primary_key=True, index=True)
    homework_id  = Column(Integer, ForeignKey("homeworks.id"), nullable=False)
    student_id   = Column(Integer, ForeignKey("users.id"),     nullable=False)
    file_path    = Column(String(400), nullable=True)
    comment      = Column(Text, nullable=True)
    score        = Column(Float, nullable=True)
    feedback     = Column(Text, nullable=True)
    graded       = Column(Boolean, default=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    late         = Column(Boolean, default=False)

    homework = relationship("Homework", back_populates="submissions")
    student  = relationship("User",     back_populates="homework_submissions")


# ══════════════════════════════════════════════════════
#  NOTIFICATIONS
# ══════════════════════════════════════════════════════

class Notification(Base):
    __tablename__ = "notifications"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    type       = Column(String(50), nullable=False)
    title      = Column(String(200), nullable=False)
    body       = Column(Text, nullable=True)
    link       = Column(String(300), nullable=True)
    is_read    = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="notifications")


# ══════════════════════════════════════════════════════
#  VIDÉOCONFÉRENCE
# ══════════════════════════════════════════════════════

class VideoSession(Base):
    __tablename__ = "video_sessions"
    id           = Column(Integer, primary_key=True, index=True)
    course_id    = Column(Integer, ForeignKey("courses.id"), nullable=False)
    teacher_id   = Column(Integer, ForeignKey("users.id"),   nullable=False)
    title        = Column(String(200), nullable=False)
    room_id      = Column(String(100), unique=True, nullable=False)
    scheduled_at = Column(DateTime, nullable=True)
    is_active    = Column(Boolean, default=False)
    ended_at     = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    course = relationship("Course", back_populates="sessions")


def init_db():
    Base.metadata.create_all(bind=engine)
